// server.js (Single File Project)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { nanoid } from "nanoid";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 5173;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_SIZE = process.env.IMAGE_SIZE || "1024x1024";

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing in .env");
  process.exit(1);
}

// Bangla detector
function isBanglaText(txt = "") {
  return /[\u0980-\u09FF]/.test(txt);
}

// API route
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message_en: "Please provide a valid script (prompt).",
          message_bn: "দয়া করে একটি বৈধ স্ক্রিপ্ট দিন।",
        },
      });
    }

    const langBN = isBanglaText(prompt);
    const variationTag = nanoid();
    const promptWithVariation = `${prompt.trim()}\n\n[variation:${variationTag}]`;

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: promptWithVariation,
        size: IMAGE_SIZE,
        n: 1,
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      let reason = `${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.error?.message) reason = errJson.error.message;
      } catch {}
      return res.status(500).json({
        ok: false,
        error: {
          code: "OPENAI_ERROR",
          message_en: `Image generation failed. Reason: ${reason}`,
          message_bn: `ইমেজ জেনারেশন ব্যর্থ হয়েছে। কারণ: ${reason}`,
          lang: langBN ? "bn" : "en",
        },
      });
    }

    const data = await response.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(502).json({
        ok: false,
        error: {
          code: "NO_IMAGE",
          message_en: "No image returned. Try again.",
          message_bn: "কোনো ইমেজ ফেরত দেয়নি। আবার চেষ্টা করুন।",
        },
      });
    }

    const fileName = `ai-photo-${Date.now()}-${variationTag}.png`;
    res.json({ ok: true, fileName, b64 });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message_en: `Server error: ${err.message}`,
        message_bn: `সার্ভারে সমস্যা হয়েছে: ${err.message}`,
      },
    });
  }
});

// Serve frontend (inline HTML+CSS+JS)
app.get("/", (req, res) => {
  res.send(\`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Photo Generator</title>
  <style>
    body { font-family: Arial, sans-serif; background:#0b0f19; color:#e8ecf3; margin:0; padding:20px;}
    .container { max-width:800px; margin:auto; background:#121829; padding:20px; border-radius:12px;}
    textarea { width:100%; padding:10px; border-radius:8px; background:#0c1326; color:#fff; border:1px solid #233054;}
    button { margin:5px; padding:10px 16px; border:none; border-radius:8px; cursor:pointer;}
    #btnStart { background:#141e39; color:#fff;}
    #btnEntire { background:#6aa6ff; color:#000; font-weight:bold;}
    #imageWrap img { width:100%; border-radius:12px; margin-top:12px;}
    .download { display:inline-block; margin-top:8px; background:#0e1a36; padding:6px 12px; border-radius:8px; text-decoration:none; color:#cfe0ff;}
    #errorBox { display:none; background:#2a0f16; color:#ffd4d4; padding:10px; border-radius:8px; margin-top:10px;}
    #spinner { display:none; margin-top:10px; }
    #spinner.on { display:inline-block; width:20px; height:20px; border:3px solid #7ca8ff; border-top-color:transparent; border-radius:50%; animation:spin .9s linear infinite;}
    @keyframes spin { to { transform: rotate(360deg);} }
  </style>
</head>
<body>
  <div class="container">
    <h2>AI Photo Generator (Bangla + English)</h2>
    <button id="btnStart">Start</button>
    <button id="btnEntire">ENTIRE</button>
    <div id="welcome"></div>
    <textarea id="prompt" rows="4" placeholder="Write your script in Bangla or English…"></textarea>
    <div id="errorBox"></div>
    <div id="spinner"></div>
    <div id="imageWrap"></div>
  </div>

<script>
  const btnStart = document.getElementById('btnStart');
  const btnEntire = document.getElementById('btnEntire');
  const welcome = document.getElementById('welcome');
  const promptInput = document.getElementById('prompt');
  const imageWrap = document.getElementById('imageWrap');
  const errorBox = document.getElementById('errorBox');
  const spinner = document.getElementById('spinner');

  function isBanglaText(txt=''){ return /[\\u0980-\\u09FF]/.test(txt); }
  function showError(msg){ errorBox.textContent=msg; errorBox.style.display='block'; }
  function clearError(){ errorBox.style.display='none'; }
  function clearImage(){ imageWrap.innerHTML=''; }
  function setBusy(b){ btnStart.disabled=b; btnEntire.disabled=b; spinner.classList.toggle('on',b); }

  btnStart.addEventListener('click',()=>{
    clearError();
    welcome.textContent='Welcome! Please enter your script and click ENTIRE to generate a photo.';
    promptInput.focus();
  });

  btnEntire.addEventListener('click', async ()=>{
    clearError();
    const prompt=promptInput.value.trim();
    if(!prompt){ showError('Please write a script first.'); return; }
    clearImage(); setBusy(true);
    try{
      const resp=await fetch('/api/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt})
      });
      const json=await resp.json();
      if(!json.ok){
        const msg=isBanglaText(prompt)?(json?.error?.message_bn||'ত্রুটি ঘটেছে।'): (json?.error?.message_en||'Error occurred.');
        showError(msg); return;
      }
      const {fileName,b64}=json;
      const imgUrl='data:image/png;base64,'+b64;
      const img=document.createElement('img');
      img.src=imgUrl;
      const a=document.createElement('a');
      a.href=imgUrl; a.download=fileName; a.textContent='⬇ Download'; a.className='download';
      imageWrap.appendChild(img); imageWrap.appendChild(a);
    }catch(err){
      const msg=isBanglaText(prompt)?'ইমেজ জেনারেশনে ত্রুটি: '+err.message:'Error generating image: '+err.message;
      showError(msg);
    }finally{ setBusy(false); }
  });
</script>
</body>
</html>
  \`);
});

app.listen(PORT, () => {
  console.log(\`🚀 Server running at http://localhost:\${PORT}\`);
});
