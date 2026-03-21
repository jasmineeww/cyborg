import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────────
const store = {
  get: async (k) => { try { const r = await window.storage.get(k); return r?.value ?? null; } catch { return null; } },
  set: async (k, v) => { try { await window.storage.set(k, v); } catch {} },
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmtTime = (d) => d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDate = (d) => d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
const nowStr = () => new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isSameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

function getTriggered(text, cats) {
  const lower = (text || "").toLowerCase();
  return cats.flatMap(c => c.entries.filter(e => e.enabled && e.keywords.some(k => k.trim() && lower.includes(k.trim().toLowerCase()))).map(e => ({ ...e, catName: c.name })));
}
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}
const REACTION_EMOJIS = ["❤️", "😆", "😮", "😢", "👍", "🙏"];
const MAX_RENDER = 80;
const DEFAULT_CATS = [
  { id: "char", name: "角色设定", expanded: true, entries: [] },
  { id: "user", name: "用户设定", expanded: false, entries: [] },
  { id: "func", name: "功能型", expanded: false, entries: [] },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d0d;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Noto Sans SC',-apple-system,sans-serif}
.scene{display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;background:radial-gradient(ellipse at 30% 40%,#1e0a3c 0%,#0d0d0d 60%)}
.phone{width:375px;height:780px;background:#0a0a0a;border-radius:52px;padding:11px;position:relative;box-shadow:0 0 0 1px #2a2a2a,0 0 0 2px #1a1a1a,0 40px 100px rgba(0,0,0,.9),0 0 60px rgba(180,120,220,.08)}
.phone::before{content:'';position:absolute;left:-3px;top:120px;width:3px;height:36px;background:#1a1a1a;border-radius:2px 0 0 2px;box-shadow:0 50px 0 #1a1a1a,0 96px 0 #1a1a1a}
.phone::after{content:'';position:absolute;right:-3px;top:160px;width:3px;height:68px;background:#1a1a1a;border-radius:0 2px 2px 0}
.screen{width:100%;height:100%;border-radius:42px;overflow:hidden;background:#fdf7f2;display:flex;flex-direction:column;position:relative}
.island{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:118px;height:34px;background:#0a0a0a;border-radius:20px;z-index:20}
.statusbar{height:52px;display:flex;justify-content:space-between;align-items:flex-end;padding:0 26px 8px;flex-shrink:0}
.st{font-size:15px;font-weight:600;color:#1a1a1a;letter-spacing:-.3px}
.si{display:flex;align-items:center;gap:6px}
.chat-header{display:flex;align-items:center;padding:10px 16px;gap:10px;border-bottom:1px solid rgba(0,0,0,.07);background:rgba(253,247,242,.96);backdrop-filter:blur(12px);flex-shrink:0}
.back-btn{font-size:22px;color:#c47ab0;background:none;border:none;cursor:pointer;padding:0 2px}
.header-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#c47ab0,#8f6cc4);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;overflow:hidden;box-shadow:0 2px 8px rgba(180,120,220,.3)}
.header-avatar img{width:100%;height:100%;object-fit:cover}
.char-info{flex:1;min-width:0}
.char-name{font-size:15px;font-weight:500;color:#1a1a1a}
.char-status-row{display:flex;align-items:center;gap:5px;margin-top:1px}
.status-dot{width:6px;height:6px;border-radius:50%;background:#ccc;flex-shrink:0}
.status-dot.online{background:#4CAF50}
.status-dot.busy{background:#FF9800}
.status-dot.away{background:#9E9E9E}
.char-status-txt{font-size:11px;color:#a0a0a0}
.hbtns{display:flex;gap:2px}
.hbtn{background:none;border:none;cursor:pointer;font-size:17px;color:#888;padding:4px;border-radius:8px;transition:background .15s}
.hbtn:hover{background:rgba(0,0,0,.05)}

/* info bars */
.info-bars{flex-shrink:0}
.api-bar{display:flex;align-items:center;justify-content:space-between;padding:4px 14px;border-bottom:1px solid rgba(0,0,0,.05);background:#faf6ff}
.api-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:500;padding:2px 7px;border-radius:8px;cursor:pointer}
.api-badge.off{background:#e8f4ff;color:#4080c8}
.api-badge.px{background:#fff0e8;color:#c87040}
.adot{width:4px;height:4px;border-radius:50%}
.api-badge.off .adot{background:#4080c8}
.api-badge.px .adot{background:#c87040}
.api-hint{font-size:10px;color:#ccc}
.wb-bar{display:flex;align-items:center;gap:4px;padding:4px 14px;background:#f8f2ff;border-bottom:1px solid rgba(180,120,220,.1);flex-wrap:wrap}
.wb-lbl{font-size:9.5px;color:#b090cc;font-weight:500;margin-right:2px}
.wchip{display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:500}
.wchip.on{background:#e0f4e8;color:#3a9a5a}
.wchip.off{background:#f0f0f0;color:#bbb}
.wdot{width:5px;height:5px;border-radius:50%}
.wdot.on{background:#3a9a5a}
.wdot.off{background:#ccc}

/* messages */
.messages{flex:1;overflow-y:auto;padding:8px 12px 4px;display:flex;flex-direction:column;gap:2px;scrollbar-width:none}
.messages::-webkit-scrollbar{display:none}
.load-more-btn{text-align:center;padding:8px;font-size:11px;color:#b090cc;cursor:pointer;background:none;border:none;font-family:'Noto Sans SC',sans-serif;width:100%}
.load-more-btn:hover{color:#a060a0}

/* date separator */
.date-sep{display:flex;align-items:center;justify-content:center;padding:8px 0;gap:8px}
.date-sep-line{flex:1;height:1px;background:#e8e0f0}
.date-sep-txt{font-size:10.5px;color:#c0a8d8;background:#fdf7f2;padding:0 8px;white-space:nowrap}

/* message row */
.mrow{display:flex;align-items:flex-end;gap:6px;padding:1px 0;position:relative}
.mrow.u{flex-direction:row-reverse}
.mrow.u + .mrow.u .mavt,
.mrow.a + .mrow.a .mavt{visibility:hidden}
.mavt{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#c47ab0,#8f6cc4);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;overflow:hidden;align-self:flex-end}
.mavt img{width:100%;height:100%;object-fit:cover}
.mcol{display:flex;flex-direction:column;max-width:70%;position:relative}
.mrow.u .mcol{align-items:flex-end}
.mtime{font-size:9px;color:#ccc;margin-bottom:2px;padding:0 4px}

/* bubbles */
.bubble{padding:8px 12px;border-radius:18px;font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap;position:relative;cursor:default}
.bubble.u{background:linear-gradient(135deg,#c47ab0,#a060a0);color:white;border-bottom-right-radius:5px}
.bubble.a{background:white;color:#222;border-bottom-left-radius:5px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.bubble.pending{opacity:.65;border:1.5px dashed #c47ab0;background:white;color:#a060a0;border-bottom-right-radius:5px}

/* image bubble */
.img-bubble{border-radius:14px;overflow:hidden;max-width:180px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.img-bubble img{width:100%;display:block}
/* voice bubble */
.voice-bbl{display:flex;align-items:center;gap:7px;padding:9px 13px;border-radius:18px;cursor:pointer;min-width:110px}
.voice-bbl.u{background:linear-gradient(135deg,#c47ab0,#a060a0);border-bottom-right-radius:5px}
.voice-bbl.a{background:white;border-bottom-left-radius:5px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.vwave{display:flex;align-items:center;gap:2px;flex:1}
.vbar{width:3px;border-radius:2px;animation:vb 1s infinite ease-in-out}
.voice-bbl.u .vbar{background:rgba(255,255,255,.8)}
.voice-bbl.a .vbar{background:#c47ab0}
.vbar:nth-child(1){height:8px}.vbar:nth-child(2){height:14px;animation-delay:.1s}.vbar:nth-child(3){height:10px;animation-delay:.2s}.vbar:nth-child(4){height:16px;animation-delay:.3s}.vbar:nth-child(5){height:8px;animation-delay:.4s}
@keyframes vb{0%,100%{transform:scaleY(.5);opacity:.5}50%{transform:scaleY(1);opacity:1}}
.vdur{font-size:11px;color:#888}
.voice-bbl.u .vdur{color:rgba(255,255,255,.8)}
/* sticker */
.sticker-bbl img{width:88px;height:88px;object-fit:contain;border-radius:8px}

/* reactions */
.reaction-bar{display:flex;gap:3px;margin-top:3px;padding:0 4px;flex-wrap:wrap}
.reaction-pill{display:inline-flex;align-items:center;gap:2px;background:white;border:1px solid #efe0ff;border-radius:10px;padding:1px 6px;font-size:12px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:transform .1s}
.reaction-pill:hover{transform:scale(1.1)}
.reaction-pill.mine{background:#f0e8ff;border-color:#c47ab0}
.reaction-count{font-size:10px;color:#888}

/* reaction picker */
.reaction-picker{position:absolute;bottom:calc(100% + 6px);background:white;border-radius:24px;padding:6px 10px;display:flex;gap:6px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:40;animation:popIn .15s ease-out}
.mrow.u .reaction-picker{right:0}
.mrow.a .reaction-picker{left:26px}
@keyframes popIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
.rpick-btn{font-size:22px;cursor:pointer;transition:transform .15s;line-height:1}
.rpick-btn:hover{transform:scale(1.3)}

/* typing */
.typing{display:flex;gap:4px;align-items:center;padding:4px 0}
.dot{width:6px;height:6px;border-radius:50%;background:#ddd;animation:bo 1.2s infinite}
.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
@keyframes bo{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#ccc;text-align:center;padding:20px;font-size:13px;line-height:1.6}
.eemoji{font-size:32px;margin-bottom:4px}

/* animation */
@keyframes mIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.mrow{animation:mIn .18s ease-out}

/* input area - Instagram style */
.inputarea{flex-shrink:0;background:rgba(253,247,242,.97);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.06)}
.toolbar-expand{display:flex;gap:10px;padding:8px 14px 4px;align-items:center;flex-wrap:wrap;animation:slideDown .15s ease-out}
@keyframes slideDown{from{opacity:0;height:0}to{opacity:1}}
.tbtn{background:none;border:none;cursor:pointer;font-size:20px;padding:4px;opacity:.65;transition:all .15s;line-height:1;border-radius:10px}
.tbtn:hover{opacity:1;background:rgba(196,122,176,.1)}
.tbtn.active{opacity:1;color:#c47ab0}
.tbtn-lbl{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9px;color:#aaa;cursor:pointer}
.tbtn-lbl .tbtn{padding:2px}
.input-row{display:flex;align-items:center;gap:8px;padding:8px 12px 20px}
.plus-btn{width:34px;height:34px;border-radius:50%;background:#f0e8f8;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;color:#c47ab0;flex-shrink:0;transition:transform .15s}
.plus-btn:hover{transform:rotate(45deg)}
.plus-btn.open{transform:rotate(45deg)}
.iwrap{flex:1;background:white;border-radius:22px;box-shadow:0 1px 3px rgba(0,0,0,.07);display:flex;align-items:center;min-height:38px;overflow:hidden}
.minput{flex:1;border:none;outline:none;padding:9px 12px;font-size:14px;font-family:'Noto Sans SC',sans-serif;background:transparent;color:#222;resize:none;max-height:80px;line-height:1.4}
.send-btn{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#c47ab0,#a060a0);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;box-shadow:0 2px 8px rgba(180,80,160,.3)}
.send-btn:active{transform:scale(.9)}
.send-btn:disabled{opacity:.4;cursor:default;box-shadow:none}
.done-btn{padding:8px 14px;background:linear-gradient(135deg,#e0a030,#c07820);color:white;border:none;border-radius:20px;font-size:12.5px;font-family:'Noto Sans SC',sans-serif;cursor:pointer;font-weight:500;white-space:nowrap}

/* sticker panel */
.sticker-panel{position:absolute;bottom:76px;left:0;right:0;background:white;border-top:1px solid #f0e8ff;padding:10px 12px 16px;z-index:30;max-height:200px;overflow-y:auto;animation:slideUp .15s ease-out}
@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.sticker-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
.sticker-item{border-radius:10px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color .15s;aspect-ratio:1}
.sticker-item:hover{border-color:#c47ab0}
.sticker-item img{width:100%;height:100%;object-fit:contain;display:block}
.sticker-add{display:flex;gap:6px}
.sticker-url-input{flex:1;border:1.5px solid #ebebeb;border-radius:10px;padding:7px 10px;font-size:12px;outline:none;font-family:'Noto Sans SC',sans-serif}
.sticker-url-btn{padding:7px 12px;background:#c47ab0;color:white;border:none;border-radius:10px;font-size:12px;cursor:pointer;font-family:'Noto Sans SC',sans-serif}

/* fullscreen image */
.img-fs{position:absolute;inset:0;background:rgba(0,0,0,.92);z-index:100;display:flex;align-items:center;justify-content:center;border-radius:42px;cursor:pointer}
.img-fs img{max-width:92%;max-height:88%;border-radius:12px;object-fit:contain}

/* overlay / panel */
.overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:50;display:flex;align-items:flex-end;border-radius:42px;overflow:hidden;backdrop-filter:blur(2px)}
.panel{background:#fefefe;width:100%;border-radius:24px 24px 0 0;padding:20px 20px 32px;max-height:88%;overflow-y:auto;scrollbar-width:none}
.panel::-webkit-scrollbar{display:none}
.ph{width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 18px}
.ptitle{font-size:16px;font-weight:600;color:#1a1a1a;text-align:center;margin-bottom:18px}
.fl{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;display:block}
.fi{width:100%;border:1.5px solid #ebebeb;border-radius:12px;padding:10px 13px;font-size:13.5px;font-family:'Noto Sans SC',sans-serif;outline:none;margin-bottom:13px;color:#222;background:#fafafa;transition:border-color .15s}
.fi:focus{border-color:#c47ab0}
.fta{width:100%;border:1.5px solid #ebebeb;border-radius:12px;padding:10px 13px;font-size:13px;font-family:'Noto Sans SC',sans-serif;outline:none;margin-bottom:14px;color:#222;background:#fafafa;resize:vertical;min-height:90px;line-height:1.6;transition:border-color .15s}
.fta:focus{border-color:#c47ab0}
.pactions{display:flex;gap:10px}
.bsave{flex:1;padding:11px;background:linear-gradient(135deg,#c47ab0,#a060a0);color:white;border:none;border-radius:14px;font-size:14px;font-family:'Noto Sans SC',sans-serif;cursor:pointer;font-weight:500}
.bsec{padding:11px 14px;background:#f5f5f5;color:#888;border:none;border-radius:14px;font-size:13px;font-family:'Noto Sans SC',sans-serif;cursor:pointer}
.bdanger{padding:11px 14px;background:#fff0f0;color:#e06060;border:none;border-radius:14px;font-size:13px;font-family:'Noto Sans SC',sans-serif;cursor:pointer}
.divider{height:1px;background:#f0f0f0;margin:12px 0}
.tabnav{display:flex;gap:2px;background:#f0f0f0;border-radius:10px;padding:3px;margin-bottom:16px}
.tabbtn{flex:1;padding:6px 2px;border:none;border-radius:8px;font-size:11px;font-family:'Noto Sans SC',sans-serif;cursor:pointer;transition:all .15s;color:#888;background:transparent}
.tabbtn.active{background:white;color:#333;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.apicards{display:flex;gap:8px;margin-bottom:14px}
.apicard{flex:1;padding:10px;border-radius:14px;cursor:pointer;border:2px solid transparent;transition:all .15s;background:#f7f7f7}
.apicard.sol{border-color:#4080c8;background:#f0f6ff}
.apicard.spx{border-color:#c87040;background:#fff5f0}
.acard-t{font-size:12px;font-weight:600;color:#333;margin-bottom:3px}
.apicard.sol .acard-t{color:#4080c8}
.apicard.spx .acard-t{color:#c87040}
.acard-d{font-size:10.5px;color:#aaa;line-height:1.4}
.scard{border:1.5px solid #f0f0f0;border-radius:14px;padding:13px;margin-bottom:13px;background:#fafafa}
.scard-t{font-size:12px;font-weight:600;color:#888;margin-bottom:10px}
.fetch-row{display:flex;gap:8px;margin-bottom:13px;margin-top:-9px}
.fbtn{padding:7px 12px;background:#f0f0f0;border:none;border-radius:10px;font-size:12px;font-family:'Noto Sans SC',sans-serif;cursor:pointer;color:#666;white-space:nowrap}
.fbtn:hover{background:#e8e8e8}
.fbtn:disabled{opacity:.5;cursor:default}
.model-sel{width:100%;border:1.5px solid #ebebeb;border-radius:10px;padding:8px 10px;font-size:12.5px;font-family:'Noto Sans SC',sans-serif;outline:none;color:#222;background:#fafafa;margin-bottom:13px}
.mtag{display:inline-block;font-size:11px;padding:3px 8px;border-radius:6px;margin-top:-9px;margin-bottom:13px}
.mtag.off{background:#e8f0ff;color:#4080c8}
.mtag.px{background:#fff0e8;color:#c87040}
.ptabs{display:flex;gap:6px;margin-bottom:13px}
.ptab{flex:1;padding:7px;border-radius:10px;border:1.5px solid #ebebeb;background:#fafafa;cursor:pointer;font-size:12px;font-family:'Noto Sans SC',sans-serif;color:#888;text-align:center;transition:all .15s}
.ptab.active{border-color:#c47ab0;background:#fdf0f8;color:#c47ab0;font-weight:500}
.avatar-preview{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#c47ab0,#8f6cc4);display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;margin:0 auto 12px;box-shadow:0 2px 10px rgba(180,120,220,.3);cursor:pointer}
.avatar-preview img{width:100%;height:100%;object-fit:cover}
.status-btns{display:flex;gap:6px;margin-bottom:13px}
.status-btn{flex:1;padding:7px;border-radius:10px;border:1.5px solid #ebebeb;background:#fafafa;cursor:pointer;font-size:11.5px;font-family:'Noto Sans SC',sans-serif;color:#888;text-align:center;transition:all .15s}
.status-btn.sel-online{border-color:#4CAF50;background:#f0fff4;color:#3a9a5a;font-weight:500}
.status-btn.sel-busy{border-color:#FF9800;background:#fffaf0;color:#c07820;font-weight:500}
.status-btn.sel-away{border-color:#9E9E9E;background:#f5f5f5;color:#666;font-weight:500}
.wbcats{display:flex;flex-direction:column;gap:9px;margin-bottom:13px}
.wbcat{border:1.5px solid #ebebeb;border-radius:14px;overflow:hidden;background:#fafafa}
.wbcat-hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;cursor:pointer;background:#f5f0ff}
.wbcat-name{font-size:13px;font-weight:600;color:#8060b0}
.wbcat-acts{display:flex;gap:5px;align-items:center}
.wbcat-body{padding:9px 9px 5px}
.wbe{border:1px solid #f0e8ff;border-radius:10px;padding:8px 10px;margin-bottom:5px;background:white}
.wbe-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.wbe-name{font-size:12px;font-weight:500;color:#333;cursor:pointer}
.wbe-acts{display:flex;gap:5px;align-items:center}
.wtog{width:28px;height:16px;border-radius:8px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
.wtog.on{background:#3a9a5a}.wtog.off{background:#ddd}
.wtog-dot{position:absolute;top:2px;width:12px;height:12px;border-radius:50%;background:white;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.wtog.on .wtog-dot{left:14px}.wtog.off .wtog-dot{left:2px}
.wdel{background:none;border:none;cursor:pointer;color:#ddd;font-size:14px;line-height:1}
.wdel:hover{color:#f08080}
.wkw{font-size:10.5px;color:#b090cc;margin-bottom:3px}
.wprev{font-size:11px;color:#888;line-height:1.4}
.btn-addwb{width:100%;padding:7px;border:1.5px dashed #d0b8e8;border-radius:10px;background:transparent;color:#b090cc;font-size:12px;font-family:'Noto Sans SC',sans-serif;cursor:pointer;margin-bottom:5px}
.btn-addwb:hover{background:#f8f0ff}
.btn-addcat{width:100%;padding:9px;border:1.5px dashed #c0a8e0;border-radius:12px;background:transparent;color:#a080cc;font-size:12.5px;font-family:'Noto Sans SC',sans-serif;cursor:pointer;margin-bottom:13px}
.btn-addcat:hover{background:#f4eeff}
.memcard{border:1.5px solid #e8eeff;border-radius:14px;padding:13px;background:#f8faff;margin-bottom:13px}
.memcard-t{font-size:12px;font-weight:600;color:#7090cc;margin-bottom:7px;display:flex;align-items:center;justify-content:space-between}
.memtxt{font-size:12px;color:#555;line-height:1.6;white-space:pre-wrap}
.mem-edit{width:100%;border:1.5px solid #c8d8ff;border-radius:10px;padding:8px 10px;font-size:12px;font-family:'Noto Sans SC',sans-serif;outline:none;color:#333;background:white;resize:vertical;min-height:80px;margin-top:7px}
.num-row{display:flex;align-items:center;gap:8px;margin-bottom:13px}
.num-row label{font-size:12px;color:#888;flex:1}
.num-input{width:56px;border:1.5px solid #ebebeb;border-radius:8px;padding:5px 8px;font-size:13px;outline:none;text-align:center;color:#333}
.hint-box{font-size:11.5px;color:#9090cc;padding:8px 12px;background:#f5f0ff;border-radius:10px;line-height:1.6;margin-bottom:13px}
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Battery = () => (<svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="#1a1a1a" strokeOpacity=".35"/><rect x="2" y="2" width="17" height="8" rx="2" fill="#1a1a1a"/><path d="M23 4V8C23.8 7.6 24.5 6.8 24.5 6 24.5 5.2 23.8 4.4 23 4Z" fill="#1a1a1a" fillOpacity=".4"/></svg>);
const Signal = () => (<svg width="17" height="12" viewBox="0 0 17 12" fill="#1a1a1a"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>);
const Wifi = () => (<svg width="16" height="12" viewBox="0 0 16 12" fill="#1a1a1a"><path d="M8 9.5C8.83 9.5 9.5 10.17 9.5 11S8.83 12.5 8 12.5 6.5 11.83 6.5 11 7.17 9.5 8 9.5Z"/><path d="M3.5 6.5C4.8 5.2 6.3 4.5 8 4.5 9.7 4.5 11.2 5.2 12.5 6.5" strokeWidth="1.4" stroke="#1a1a1a" fill="none" strokeLinecap="round"/><path d="M1 3.5C3 1.5 5.4.5 8 .5 10.6.5 13 1.5 15 3.5" strokeWidth="1.4" stroke="#1a1a1a" fill="none" strokeLinecap="round"/></svg>);
const SendSvg = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function YuLePhone() {
  const [curTime, setCurTime] = useState("00:00");
  const [showSettings, setShowSettings] = useState(false);
  const [sTab, setSTab] = useState("persona");
  const messagesEnd = useRef(null);
  const fileInputRef = useRef(null);
  const userFileInputRef = useRef(null);
  const charFileInputRef = useRef(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [fullscreenImg, setFullscreenImg] = useState(null);
  const [showStickers, setShowStickers] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [stickerUrlInput, setStickerUrlInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [visibleFrom, setVisibleFrom] = useState(0);
  const recordTimer = useRef(null);
  const interruptTimer = useRef(null);
  const longPressTimer = useRef(null);

  // Interrupt
  const [interruptOn, setInterruptOn] = useState(false);
  const [interruptDelay, setInterruptDelay] = useState(4);

  // Persona
  const [charName, setCharName] = useState("余乐");
  const [charEmoji, setCharEmoji] = useState("🌙");
  const [charAvatarUrl, setCharAvatarUrl] = useState("");
  const [charAvatarData, setCharAvatarData] = useState(""); // base64 for char
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [userAvatarData, setUserAvatarData] = useState(""); // base64 for user
  const [charStatus, setCharStatus] = useState("online"); // online | busy | away
  const [charStatusTxt, setCharStatusTxt] = useState("在线");
  const [pTab, setPTab] = useState("char");
  const [charCard, setCharCard] = useState("");
  const [userCard, setUserCard] = useState("");
  const [avatarEditTarget, setAvatarEditTarget] = useState(null); // "char" | "user"

  // API
  const [apiMode, setApiMode] = useState("official");
  const [offKey, setOffKey] = useState("");
  const [offModel, setOffModel] = useState("claude-sonnet-4-20250514");
  const [pxUrl, setPxUrl] = useState("");
  const [pxKey, setPxKey] = useState("");
  const [pxModel, setPxModel] = useState("claude-sonnet-4-20250514");
  const [pxModels, setPxModels] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [sumUseMain, setSumUseMain] = useState(true);
  const [sumKey, setSumKey] = useState("");
  const [sumUrl, setSumUrl] = useState("");
  const [sumModel, setSumModel] = useState("claude-haiku-4-5-20251001");
  const [sumModels, setSumModels] = useState([]);
  const [fetchingSum, setFetchingSum] = useState(false);

  // World book
  const [wbCats, setWbCats] = useState(DEFAULT_CATS);
  const [triggered, setTriggered] = useState([]);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryForm, setEntryForm] = useState({ name: "", keywords: "", content: "", enabled: true });
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: "" });

  // Memory
  const [memSummary, setMemSummary] = useState("");
  const [memEditing, setMemEditing] = useState(false);
  const [memDraft, setMemDraft] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [memTrigger, setMemTrigger] = useState(20);
  const [memContext, setMemContext] = useState(30);

  // Stickers
  const [stickers, setStickers] = useState([]);

  // ── Boot ──
  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  useEffect(() => {
    const tick = () => setCurTime(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }));
    tick(); const t = setInterval(tick, 10000); return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      setCharName(await store.get("yn") || "余乐");
      setCharEmoji(await store.get("ye") || "🌙");
      setCharAvatarUrl(await store.get("yav") || "");
      setCharAvatarData(await store.get("yavd") || "");
      setUserAvatarUrl(await store.get("yuav") || "");
      setUserAvatarData(await store.get("yuavd") || "");
      setCharStatus(await store.get("yst") || "online");
      setCharStatusTxt(await store.get("ysttxt") || "在线");
      setCharCard(await store.get("ycc") || "");
      setUserCard(await store.get("yuc") || "");
      setApiMode(await store.get("yam") || "official");
      setOffKey(await store.get("yok") || "");
      setOffModel(await store.get("yom") || "claude-sonnet-4-20250514");
      setPxUrl(await store.get("ypu") || "");
      setPxKey(await store.get("ypk") || "");
      setPxModel(await store.get("ypm") || "claude-sonnet-4-20250514");
      const su = await store.get("ysum_main"); if (su !== null) setSumUseMain(su === "true");
      setSumKey(await store.get("ysum_key") || "");
      setSumUrl(await store.get("ysum_url") || "");
      setSumModel(await store.get("ysum_model") || "claude-haiku-4-5-20251001");
      const wb = await store.get("ywb"); if (wb) setWbCats(JSON.parse(wb));
      const mem = await store.get("ymem"); if (mem) setMemSummary(mem);
      const mt = await store.get("ymem_trigger"); if (mt) setMemTrigger(parseInt(mt));
      const mc = await store.get("ymem_context"); if (mc) setMemContext(parseInt(mc));
      const sk = await store.get("ystickers"); if (sk) setStickers(JSON.parse(sk));
      const ion = await store.get("yinterrupt"); if (ion) setInterruptOn(ion === "true");
      const id2 = await store.get("yinterrupt_delay"); if (id2) setInterruptDelay(parseInt(id2));
    })();
  }, []);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  useEffect(() => {
    const txt = [input, ...messages.map(m => typeof m.content === "string" ? m.content : "")].join(" ");
    setTriggered(getTriggered(txt, wbCats));
  }, [input, messages, wbCats]);

  useEffect(() => {
    if (!interruptOn || !input.trim() || multiMode || loading) return;
    clearTimeout(interruptTimer.current);
    interruptTimer.current = setTimeout(() => {
      if (input.trim() && !loading) doSend(input, messages);
    }, interruptDelay * 1000);
    return () => clearTimeout(interruptTimer.current);
  }, [input, interruptOn, interruptDelay, multiMode, loading]);

  // ── Avatar helpers ──
  const charAvatarSrc = charAvatarData ? `data:image/jpeg;base64,${charAvatarData}` : charAvatarUrl || null;
  const userAvatarSrc = userAvatarData ? `data:image/jpeg;base64,${userAvatarData}` : userAvatarUrl || null;

  const CharAvatar = ({ size = 26 }) => (
    <div className="mavt" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {charAvatarSrc ? <img src={charAvatarSrc} alt="" /> : charEmoji}
    </div>
  );
  const UserAvatar = ({ size = 26 }) => (
    <div className="mavt" style={{ width: size, height: size, fontSize: size * 0.5, background: "linear-gradient(135deg,#a0a0d0,#7070b0)" }}>
      {userAvatarSrc ? <img src={userAvatarSrc} alt="" /> : "🙋"}
    </div>
  );

  const statusDotClass = `status-dot ${charStatus}`;
  const statusLabels = { online: "在线", busy: "忙碌", away: "离开" };

  // ── Save ──
  const save = async () => {
    await store.set("yn", charName); await store.set("ye", charEmoji);
    await store.set("yav", charAvatarUrl); await store.set("yavd", charAvatarData);
    await store.set("yuav", userAvatarUrl); await store.set("yuavd", userAvatarData);
    await store.set("yst", charStatus); await store.set("ysttxt", charStatusTxt);
    await store.set("ycc", charCard); await store.set("yuc", userCard);
    await store.set("yam", apiMode); await store.set("yok", offKey); await store.set("yom", offModel);
    await store.set("ypu", pxUrl); await store.set("ypk", pxKey); await store.set("ypm", pxModel);
    await store.set("ysum_main", String(sumUseMain)); await store.set("ysum_key", sumKey);
    await store.set("ysum_url", sumUrl); await store.set("ysum_model", sumModel);
    await store.set("ywb", JSON.stringify(wbCats));
    await store.set("ymem_trigger", String(memTrigger)); await store.set("ymem_context", String(memContext));
    await store.set("ystickers", JSON.stringify(stickers));
    await store.set("yinterrupt", String(interruptOn)); await store.set("yinterrupt_delay", String(interruptDelay));
    setShowSettings(false);
  };

  // ── API helpers ──
  const getCallParams = (mode) => {
    if (mode === "summary") {
      if (sumUseMain) return { key: apiMode === "official" ? offKey : pxKey, base: apiMode === "proxy" && pxUrl ? pxUrl.replace(/\/$/, "") : "https://api.anthropic.com", model: sumModel, isOff: apiMode === "official" };
      return { key: sumKey, base: sumUrl ? sumUrl.replace(/\/$/, "") : "https://api.anthropic.com", model: sumModel, isOff: !sumUrl };
    }
    return { key: apiMode === "official" ? offKey : pxKey, base: apiMode === "proxy" && pxUrl ? pxUrl.replace(/\/$/, "") : "https://api.anthropic.com", model: apiMode === "official" ? offModel : pxModel, isOff: apiMode === "official" };
  };

  const callAPI = async (p, msgs, sys) => {
    const headers = { "Content-Type": "application/json", "x-api-key": p.key, "anthropic-version": "2023-06-01" };
    if (p.isOff) headers["anthropic-dangerous-direct-browser-access"] = "true";
    const res = await fetch(`${p.base}/v1/messages`, { method: "POST", headers, body: JSON.stringify({ model: p.model, max_tokens: 1000, system: sys, messages: msgs }) });
    return res.json();
  };

  const fetchModels = async (which) => {
    const url = which === "sum" ? sumUrl : pxUrl;
    const key = which === "sum" ? sumKey : pxKey;
    if (!key) return;
    if (which === "sum") setFetchingSum(true); else setFetching(true);
    try {
      const base = url ? url.replace(/\/$/, "") : "https://api.anthropic.com";
      const res = await fetch(`${base}/v1/models`, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
      const data = await res.json();
      const list = data.data?.map(m => m.id) || [];
      if (which === "sum") { if (list.length) setSumModels(list); }
      else { if (list.length) { setPxModels(list); if (!list.includes(pxModel)) setPxModel(list[0]); } }
    } catch {}
    if (which === "sum") setFetchingSum(false); else setFetching(false);
  };

  // ── Build system prompt ──
  const buildSystem = (allText) => {
    const hits = getTriggered(allText, wbCats);
    const wbInject = hits.length > 0 ? "\n\n【世界书触发记忆】\n" + hits.map(e => `▸ [${e.catName}] ${e.name}：${e.content}`).join("\n") : "";
    const memInject = memSummary ? `\n\n【长期记忆摘要】\n${memSummary}` : "";
    const userInject = userCard ? `\n\n【关于用户】\n${userCard}` : "";
    return `${charCard}${userInject}${wbInject}${memInject}\n\n【当前时间】${nowStr()}`;
  };

  // ── Summarize ──
  const summarize = useCallback(async (msgs, force = false) => {
    const p = getCallParams("summary");
    if (!p.key || (!force && msgs.length < memTrigger)) return;
    setSummarizing(true);
    try {
      const older = msgs.slice(0, -Math.min(10, msgs.length));
      const txt = older.map(m => `${m.role === "user" ? "Jasmine" : charName}: ${typeof m.content === "string" ? m.content : "[媒体]"}`).join("\n");
      const prev = await store.get("ymem") || "";
      const data = await callAPI(p, [{ role: "user", content: `请将对话压缩成200字以内的长期记忆摘要。已有摘要：${prev}\n\n新对话：\n${txt}\n\n输出合并后的新摘要：` }], "你是记忆总结助手，请简洁准确总结要点。");
      if (data.content?.[0]?.text) { setMemSummary(data.content[0].text); await store.set("ymem", data.content[0].text); }
    } catch {}
    setSummarizing(false);
  }, [apiMode, offKey, pxKey, offModel, pxModel, pxUrl, sumUseMain, sumKey, sumUrl, sumModel, memTrigger, charName]);

  // ── Core send with one-by-one reply animation ──
  const doSend = async (textHint, currentMsgs) => {
    clearTimeout(interruptTimer.current);
    const p = getCallParams("main");
    if (!p.key) { setShowSettings(true); return; }

    const allText = currentMsgs.map(m => typeof m.content === "string" ? m.content : "").join(" ");
    const sys = buildSystem(allText + " " + textHint);

    const apiHistory = currentMsgs.slice(-memContext).map(m => ({
      role: m.role,
      content: m.type === "image" ? [{ type: "image", source: { type: "base64", media_type: m.mediaType, data: m.data } }, { type: "text", text: m.caption || "请看这张图片并回应" }]
        : m.type === "sticker" ? [{ type: "image", source: { type: "url", url: m.url } }, { type: "text", text: "(发了一个表情包)" }]
        : m.type === "voice" ? `(发了一段${m.duration}秒语音)`
        : typeof m.content === "string" ? m.content : ""
    }));

    setLoading(true);
    try {
      const data = await callAPI(p, apiHistory, sys);
      const reply = data.content?.[0]?.text || (data.error ? `⚠️ ${data.error.message}` : "⚠️ 未知错误");
      // Split reply into multiple parts for one-by-one effect
      const parts = reply.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
      const finalParts = parts.length > 1 ? parts : [reply];

      for (let i = 0; i < finalParts.length; i++) {
        if (i > 0) {
          setLoading(true);
          await new Promise(r => setTimeout(r, 600 + Math.min(finalParts[i].length * 15, 1200)));
        }
        const msg = { role: "assistant", content: finalParts[i], time: fmtTime(new Date()), id: uid(), ts: Date.now(), reactions: {} };
        setMessages(prev => {
          const updated = [...prev, msg];
          if (i === finalParts.length - 1 && updated.length >= memTrigger && updated.length % memTrigger === 0) summarize(updated);
          return updated;
        });
        setLoading(false);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ 网络错误，请检查API设置", time: fmtTime(new Date()), id: uid(), ts: Date.now(), reactions: {} }]);
      setLoading(false);
    }
  };

  // ── Handle send (multi or single) ──
  const handleSend = () => {
    if (!input.trim()) return;
    clearTimeout(interruptTimer.current);
    const msg = { role: "user", content: input.trim(), time: fmtTime(new Date()), id: uid(), ts: Date.now(), reactions: {}, pending: multiMode };
    setMessages(prev => [...prev, msg]);
    setInput("");
    if (!multiMode) doSend(input.trim(), [...messages, msg]);
  };

  const flushPending = () => {
    const pending = messages.filter(m => m.pending);
    if (!pending.length) return;
    setMessages(prev => prev.map(m => m.pending ? { ...m, pending: false } : m));
    setMultiMode(false);
    const allText = pending.map(m => m.content).join(" ");
    const clearedMsgs = messages.map(m => m.pending ? { ...m, pending: false } : m);
    doSend(allText, clearedMsgs);
  };

  const hasPending = messages.some(m => m.pending);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  // ── Image ──
  const sendImage = async (file) => {
    if (!file) return;
    const base64 = await fileToBase64(file);
    const msg = { role: "user", type: "image", data: base64, mediaType: file.type, time: fmtTime(new Date()), id: uid(), ts: Date.now(), reactions: {}, content: "[图片]" };
    const newH = [...messages, msg];
    setMessages(newH);
    doSend("", newH);
  };

  // ── Sticker ──
  const sendSticker = (url) => {
    const msg = { role: "user", type: "sticker", url, time: fmtTime(new Date()), id: uid(), ts: Date.now(), reactions: {}, content: "[表情包]" };
    const newH = [...messages, msg];
    setMessages(newH);
    setShowStickers(false);
    doSend("", newH);
  };

  const addSticker = () => {
    if (!stickerUrlInput.trim()) return;
    const s = [...stickers, stickerUrlInput.trim()]; setStickers(s); store.set("ystickers", JSON.stringify(s)); setStickerUrlInput("");
  };

  // ── Voice ──
  const startRecord = () => { setRecording(true); setRecordSeconds(0); recordTimer.current = setInterval(() => setRecordSeconds(s => s + 1), 1000); };
  const stopRecord = () => {
    clearInterval(recordTimer.current); setRecording(false);
    const dur = recordSeconds;
    const msg = { role: "user", type: "voice", duration: dur, time: fmtTime(new Date()), id: uid(), ts: Date.now(), reactions: {}, content: `[语音 ${dur}s]` };
    const newH = [...messages, msg];
    setMessages(newH);
    doSend(`(发了${dur}秒语音)`, newH);
  };

  // ── Reactions ──
  const toggleReaction = (msgId, emoji) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const r = { ...m.reactions };
      if (r[emoji]) delete r[emoji]; else r[emoji] = 1;
      return { ...m, reactions: r };
    }));
    setReactionTarget(null);
  };

  const handleLongPress = (msgId) => { longPressTimer.current = setTimeout(() => setReactionTarget(msgId), 500); };
  const handlePressEnd = () => clearTimeout(longPressTimer.current);

  // ── Avatar upload ──
  const handleAvatarFile = async (file, target) => {
    if (!file) return;
    const base64 = await fileToBase64(file);
    if (target === "char") setCharAvatarData(base64);
    else setUserAvatarData(base64);
  };

  // ── Performance: virtualized rendering ──
  const allMessages = messages;
  const visibleMessages = useMemo(() => {
    if (allMessages.length <= MAX_RENDER) return allMessages;
    return allMessages.slice(Math.max(0, allMessages.length - MAX_RENDER + visibleFrom));
  }, [allMessages, visibleFrom]);
  const hasMore = allMessages.length > MAX_RENDER && visibleFrom === 0;

  // ── Date separators ──
  const withSeparators = useMemo(() => {
    const items = [];
    let lastDate = null;
    for (const m of visibleMessages) {
      const d = new Date(m.ts || Date.now());
      if (!lastDate || !isSameDay(lastDate, d)) {
        items.push({ type: "sep", date: d, id: "sep_" + d.toDateString() });
        lastDate = d;
      }
      items.push(m);
    }
    return items;
  }, [visibleMessages]);

  const allEntries = wbCats.flatMap(c => c.entries);

  // ── Render message content ──
  const renderContent = (m) => {
    if (m.type === "image") return <div className="img-bubble" onClick={() => setFullscreenImg(`data:${m.mediaType};base64,${m.data}`)}><img src={`data:${m.mediaType};base64,${m.data}`} alt="" /></div>;
    if (m.type === "sticker") return <div className="sticker-bbl"><img src={m.url} alt="sticker" /></div>;
    if (m.type === "voice") return (
      <div className={`voice-bbl ${m.role === "user" ? "u" : "a"}`}>
        <span style={{ fontSize: 16 }}>🎤</span>
        <div className="vwave">{[8,14,10,16,8].map((h,i) => <div key={i} className="vbar" style={{height:h}} />)}</div>
        <span className="vdur">{m.duration}"</span>
      </div>
    );
    const cls = m.pending ? "bubble pending" : `bubble ${m.role === "user" ? "u" : "a"}`;
    return <div className={cls}>{m.content}{m.pending ? " ⏱" : ""}</div>;
  };

  // ── WB helpers ──
  const saveEntry = () => {
    const keywords = entryForm.keywords.split(",").map(k => k.trim()).filter(Boolean);
    const { catId, entryId } = editingEntry;
    if (entryId === "new") setWbCats(cs => cs.map(c => c.id === catId ? { ...c, entries: [...c.entries, { id: uid(), name: entryForm.name || "未命名", keywords, content: entryForm.content, enabled: entryForm.enabled }] } : c));
    else setWbCats(cs => cs.map(c => c.id === catId ? { ...c, entries: c.entries.map(e => e.id === entryId ? { ...e, ...entryForm, keywords } : e) } : c));
    setEditingEntry(null);
  };
  const saveCat = () => {
    if (editingCat === "new") setWbCats(cs => [...cs, { id: uid(), name: catForm.name || "新分类", expanded: true, entries: [] }]);
    else setWbCats(cs => cs.map(c => c.id === editingCat ? { ...c, name: catForm.name } : c));
    setEditingCat(null);
  };

  return (
    <div className="scene">
      <div className="phone">
        <div className="screen" onClick={() => { setReactionTarget(null); if (showStickers) setShowStickers(false); }}>
          <div className="island" />

          {/* Status bar */}
          <div className="statusbar">
            <span className="st">{curTime}</span>
            <div className="si"><Signal /><Wifi /><Battery /></div>
          </div>

          {/* Header */}
          <div className="chat-header">
            <button className="back-btn">‹</button>
            <div className="header-avatar" style={{ width: 36, height: 36 }} onClick={() => { setShowSettings(true); setSTab("persona"); }}>
              {charAvatarSrc ? <img src={charAvatarSrc} alt="" /> : charEmoji}
            </div>
            <div className="char-info">
              <div className="char-name">{charName}</div>
              <div className="char-status-row">
                <span className={statusDotClass} />
                <span className="char-status-txt">{summarizing ? "整理记忆…" : charStatusTxt || statusLabels[charStatus]}</span>
              </div>
            </div>
            <div className="hbtns">
              <button className="hbtn" onClick={() => { setShowSettings(true); setSTab("worldbook"); }}>📖</button>
              <button className="hbtn" onClick={() => { setShowSettings(true); setSTab("persona"); }}>⚙️</button>
            </div>
          </div>

          {/* Info bars */}
          <div className="info-bars">
            <div className="api-bar">
              <span className={`api-badge ${apiMode === "official" ? "off" : "px"}`} onClick={() => setApiMode(m => m === "official" ? "proxy" : "official")}>
                <span className="adot" />{apiMode === "official" ? "官方 API" : "中转 API"}
              </span>
              <span className="api-hint">{apiMode === "official" ? offModel : pxModel}</span>
            </div>
            {allEntries.filter(e => e.enabled).length > 0 && (
              <div className="wb-bar">
                <span className="wb-lbl">WB</span>
                {allEntries.filter(e => e.enabled).map(e => {
                  const active = triggered.some(t => t.id === e.id);
                  return <span key={e.id} className={`wchip ${active ? "on" : "off"}`}><span className={`wdot ${active ? "on" : "off"}`} />{e.name}</span>;
                })}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="messages">
            {hasMore && <button className="load-more-btn" onClick={() => setVisibleFrom(v => v + MAX_RENDER)}>↑ 查看更早的消息</button>}
            {allMessages.length === 0 && (
              <div className="empty">
                <div className="eemoji">{charEmoji}</div>
                <span>和{charName}说点什么吧<br/>他在这里等你</span>
              </div>
            )}
            {withSeparators.map(item => {
              if (item.type === "sep") return (
                <div key={item.id} className="date-sep">
                  <div className="date-sep-line" />
                  <span className="date-sep-txt">{fmtDate(item.date)}</span>
                  <div className="date-sep-line" />
                </div>
              );
              const m = item;
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`mrow ${isUser ? "u" : "a"}`}>
                  {!isUser && <CharAvatar />}
                  {isUser && <UserAvatar />}
                  <div className="mcol"
                    onMouseDown={() => handleLongPress(m.id)}
                    onMouseUp={handlePressEnd}
                    onTouchStart={() => handleLongPress(m.id)}
                    onTouchEnd={handlePressEnd}
                  >
                    {m.time && <div className="mtime">{m.time}</div>}
                    {renderContent(m)}
                    {/* Reaction picker */}
                    {reactionTarget === m.id && (
                      <div className="reaction-picker" onClick={e => e.stopPropagation()}>
                        {REACTION_EMOJIS.map(em => (
                          <span key={em} className="rpick-btn" onClick={() => toggleReaction(m.id, em)}>{em}</span>
                        ))}
                      </div>
                    )}
                    {/* Reaction bar */}
                    {Object.keys(m.reactions || {}).length > 0 && (
                      <div className="reaction-bar">
                        {Object.entries(m.reactions).map(([em, cnt]) => (
                          <span key={em} className="reaction-pill mine" onClick={() => toggleReaction(m.id, em)}>
                            {em}{cnt > 1 && <span className="reaction-count">{cnt}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="mrow a">
                <CharAvatar />
                <div className="mcol">
                  <div className="bubble a"><div className="typing"><div className="dot"/><div className="dot"/><div className="dot"/></div></div>
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {/* Sticker panel */}
          {showStickers && (
            <div className="sticker-panel" onClick={e => e.stopPropagation()}>
              <div className="sticker-grid">
                {stickers.map((url, i) => (
                  <div key={i} className="sticker-item" onClick={() => sendSticker(url)}>
                    <img src={url} alt="" onError={e => e.target.style.display="none"} />
                  </div>
                ))}
              </div>
              <div className="sticker-add">
                <input className="sticker-url-input" value={stickerUrlInput} onChange={e => setStickerUrlInput(e.target.value)} placeholder="粘贴图片URL添加表情包…" />
                <button className="sticker-url-btn" onClick={addSticker}>添加</button>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="inputarea">
            {/* Expandable toolbar */}
            {toolbarOpen && (
              <div className="toolbar-expand">
                <div className="tbtn-lbl" onClick={() => fileInputRef.current?.click()}>
                  <button className="tbtn">🖼️</button>
                  <span>图片</span>
                </div>
                <div className="tbtn-lbl" onClick={() => { setShowStickers(s => !s); }}>
                  <button className="tbtn">🎭</button>
                  <span>表情包</span>
                </div>
                <div className="tbtn-lbl" onClick={recording ? stopRecord : startRecord}>
                  <button className="tbtn" style={recording ? { color: "#e04040" } : {}}>
                    {recording ? `🔴` : "🎤"}
                  </button>
                  <span>{recording ? `${recordSeconds}s` : "语音"}</span>
                </div>
                <div className="tbtn-lbl" onClick={() => { setMultiMode(m => !m); }}>
                  <button className={`tbtn ${multiMode ? "active" : ""}`}>✉️</button>
                  <span>{multiMode ? "连发中" : "连发"}</span>
                </div>
                <div className="tbtn-lbl" onClick={() => setInterruptOn(v => !v)}>
                  <button className={`tbtn ${interruptOn ? "active" : ""}`}>💬</button>
                  <span>{interruptOn ? "抢话开" : "抢话"}</span>
                </div>
                <div className="tbtn-lbl" onClick={() => { setShowSettings(true); setSTab("memory"); setToolbarOpen(false); }}>
                  <button className="tbtn">🧠</button>
                  <span>记忆</span>
                </div>
              </div>
            )}

            <div className="input-row">
              <button className={`plus-btn ${toolbarOpen ? "open" : ""}`} onClick={() => setToolbarOpen(v => !v)}>＋</button>
              <div className="iwrap">
                <textarea className="minput" rows={1} value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px"; }}
                  onKeyDown={handleKey}
                  placeholder={multiMode ? '连发模式，发完点"说完了"…' : `和${charName}说…`}
                />
              </div>
              {multiMode && hasPending
                ? <button className="done-btn" onClick={flushPending}>✓ 说完了</button>
                : <button className="send-btn" onClick={handleSend} disabled={loading || !input.trim()}><SendSvg /></button>
              }
            </div>
          </div>

          {/* Hidden inputs */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) sendImage(e.target.files[0]); e.target.value = ""; }} />
          <input ref={charFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleAvatarFile(e.target.files[0], "char"); e.target.value = ""; }} />
          <input ref={userFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleAvatarFile(e.target.files[0], "user"); e.target.value = ""; }} />

          {/* Fullscreen image */}
          {fullscreenImg && <div className="img-fs" onClick={() => setFullscreenImg(null)}><img src={fullscreenImg} alt="" /></div>}

          {/* ── Settings ── */}
          {showSettings && !editingEntry && !editingCat && (
            <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
              <div className="panel">
                <div className="ph" />
                <div className="ptitle">设置</div>
                <div className="tabnav">
                  {[["persona","人设"],["api","API"],["worldbook","世界书"],["memory","记忆"],["interact","互动"]].map(([k,l]) => (
                    <button key={k} className={`tabbtn ${sTab===k?"active":""}`} onClick={() => setSTab(k)}>{l}</button>
                  ))}
                </div>

                {/* Persona */}
                {sTab === "persona" && <>
                  <div className="ptabs">
                    <button className={`ptab ${pTab==="char"?"active":""}`} onClick={() => setPTab("char")}>角色设定</button>
                    <button className={`ptab ${pTab==="user"?"active":""}`} onClick={() => setPTab("user")}>用户设定</button>
                  </div>

                  {pTab === "char" && <>
                    {/* Char avatar */}
                    <div className="avatar-preview" onClick={() => setAvatarEditTarget("char")}>
                      {charAvatarSrc ? <img src={charAvatarSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{fontSize:28}}>{charEmoji}</span>}
                    </div>
                    {avatarEditTarget === "char" && (
                      <div style={{background:"#f8f0ff",borderRadius:12,padding:10,marginBottom:12}}>
                        <label className="fl">头像图片 URL</label>
                        <input className="fi" style={{marginBottom:8}} value={charAvatarUrl} onChange={e => { setCharAvatarUrl(e.target.value); setCharAvatarData(""); }} placeholder="https://..." />
                        <button className="fbtn" style={{width:"100%",textAlign:"center"}} onClick={() => charFileInputRef.current?.click()}>📁 从本地上传</button>
                      </div>
                    )}
                    <label className="fl">角色名称</label>
                    <input className="fi" value={charName} onChange={e => setCharName(e.target.value)} placeholder="余乐" />
                    <label className="fl">头像 Emoji（无图片时显示）</label>
                    <input className="fi" value={charEmoji} onChange={e => setCharEmoji(e.target.value)} placeholder="🌙" />
                    <label className="fl">状态</label>
                    <div className="status-btns" style={{marginBottom:8}}>
                      {["online","busy","away"].map(s => (
                        <button key={s} className={`status-btn ${charStatus===s?`sel-${s}`:""}`} onClick={() => { setCharStatus(s); setCharStatusTxt(statusLabels[s]); }}>{statusLabels[s]}</button>
                      ))}
                    </div>
                    <label className="fl">自定义状态文字</label>
                    <input className="fi" value={charStatusTxt} onChange={e => setCharStatusTxt(e.target.value)} placeholder="在线 / 看着你 / 想你了…" />
                    <label className="fl">角色卡 System Prompt</label>
                    <textarea className="fta" style={{minHeight:120}} value={charCard} onChange={e => setCharCard(e.target.value)} placeholder="粘贴余乐的角色卡…" />
                  </>}

                  {pTab === "user" && <>
                    <div className="avatar-preview" style={{background:"linear-gradient(135deg,#a0a0d0,#7070b0)"}} onClick={() => setAvatarEditTarget("user")}>
                      {userAvatarSrc ? <img src={userAvatarSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{fontSize:28}}>🙋</span>}
                    </div>
                    {avatarEditTarget === "user" && (
                      <div style={{background:"#f0f4ff",borderRadius:12,padding:10,marginBottom:12}}>
                        <label className="fl">头像图片 URL</label>
                        <input className="fi" style={{marginBottom:8}} value={userAvatarUrl} onChange={e => { setUserAvatarUrl(e.target.value); setUserAvatarData(""); }} placeholder="https://..." />
                        <button className="fbtn" style={{width:"100%",textAlign:"center"}} onClick={() => userFileInputRef.current?.click()}>📁 从本地上传</button>
                      </div>
                    )}
                    <label className="fl">用户人设</label>
                    <textarea className="fta" style={{minHeight:120}} value={userCard} onChange={e => setUserCard(e.target.value)} placeholder="描述自己：名字、性格、背景故事…" />
                  </>}

                  <div className="divider" />
                  <div className="pactions">
                    <button className="bsec" onClick={() => { setMessages([]); setShowSettings(false); }}>清空聊天</button>
                    <button className="bsave" onClick={save}>保存</button>
                  </div>
                </>}

                {/* API */}
                {sTab === "api" && <>
                  <div className="apicards">
                    <div className={`apicard ${apiMode==="official"?"sol":""}`} onClick={() => setApiMode("official")}><div className="acard-t">🔵 官方</div><div className="acard-d">支持MCP<br/>直连Anthropic</div></div>
                    <div className={`apicard ${apiMode==="proxy"?"spx":""}`} onClick={() => setApiMode("proxy")}><div className="acard-t">🟠 中转</div><div className="acard-d">省钱<br/>自定义地址</div></div>
                  </div>
                  <div className="scard">
                    <div className="scard-t">🔵 官方 API</div>
                    <label className="fl">API Key</label>
                    <input className="fi" type="password" value={offKey} onChange={e => setOffKey(e.target.value)} placeholder="sk-ant-api03-..." />
                    <label className="fl">模型</label>
                    <input className="fi" value={offModel} onChange={e => setOffModel(e.target.value)} />
                    <span className="mtag off">Anthropic 直连</span>
                  </div>
                  <div className="scard">
                    <div className="scard-t">🟠 中转 API</div>
                    <label className="fl">反代地址</label>
                    <input className="fi" value={pxUrl} onChange={e => setPxUrl(e.target.value)} placeholder="https://your-proxy.com" />
                    <label className="fl">API Key</label>
                    <input className="fi" type="password" value={pxKey} onChange={e => setPxKey(e.target.value)} />
                    <label className="fl">模型</label>
                    {pxModels.length > 0 ? <select className="model-sel" value={pxModel} onChange={e => setPxModel(e.target.value)}>{pxModels.map(m => <option key={m} value={m}>{m}</option>)}</select> : <input className="fi" value={pxModel} onChange={e => setPxModel(e.target.value)} />}
                    <div className="fetch-row"><button className="fbtn" onClick={() => fetchModels("main")} disabled={fetching}>{fetching ? "拉取中…" : "🔄 拉取模型"}</button></div>
                    <span className="mtag px">中转服务</span>
                  </div>
                  <div className="scard">
                    <div className="scard-t">🧠 摘要 API（可单独设置便宜模型）</div>
                    <div style={{display:"flex",gap:6,marginBottom:10}}>
                      <button className={`ptab ${sumUseMain?"active":""}`} style={{flex:1}} onClick={() => setSumUseMain(true)}>跟随主API</button>
                      <button className={`ptab ${!sumUseMain?"active":""}`} style={{flex:1}} onClick={() => setSumUseMain(false)}>独立配置</button>
                    </div>
                    {!sumUseMain && <>
                      <label className="fl">摘要反代地址（空=官方）</label>
                      <input className="fi" value={sumUrl} onChange={e => setSumUrl(e.target.value)} placeholder="https://..." />
                      <label className="fl">摘要 API Key</label>
                      <input className="fi" type="password" value={sumKey} onChange={e => setSumKey(e.target.value)} />
                    </>}
                    <label className="fl">摘要模型</label>
                    {sumModels.length > 0 ? <select className="model-sel" value={sumModel} onChange={e => setSumModel(e.target.value)}>{sumModels.map(m => <option key={m} value={m}>{m}</option>)}</select> : <input className="fi" value={sumModel} onChange={e => setSumModel(e.target.value)} placeholder="claude-haiku-4-5-20251001" />}
                    <div className="fetch-row"><button className="fbtn" onClick={() => fetchModels("sum")} disabled={fetchingSum}>{fetchingSum ? "拉取中…" : "🔄 拉取摘要模型"}</button></div>
                  </div>
                  <div className="pactions">
                    <button className="bsec" onClick={() => setShowSettings(false)}>关闭</button>
                    <button className="bsave" onClick={save}>保存</button>
                  </div>
                </>}

                {/* World Book */}
                {sTab === "worldbook" && <>
                  <div style={{fontSize:12,color:"#aaa",marginBottom:12,lineHeight:1.6}}>关键词触发时，对应记忆自动注入给{charName} 🌙</div>
                  <div className="wbcats">
                    {wbCats.map(cat => (
                      <div key={cat.id} className="wbcat">
                        <div className="wbcat-hdr" onClick={() => setWbCats(cs => cs.map(c => c.id===cat.id?{...c,expanded:!c.expanded}:c))}>
                          <span className="wbcat-name">{cat.expanded?"▾":"▸"} {cat.name}</span>
                          <div className="wbcat-acts" onClick={e=>e.stopPropagation()}>
                            <span style={{fontSize:10.5,color:"#aaa"}}>{cat.entries.length}条</span>
                            <button className="fbtn" style={{padding:"2px 7px",fontSize:10.5}} onClick={() => { setEditingCat(cat.id); setCatForm({name:cat.name}); }}>改名</button>
                            <button className="wdel" onClick={() => setWbCats(cs=>cs.filter(c=>c.id!==cat.id))}>×</button>
                          </div>
                        </div>
                        {cat.expanded && (
                          <div className="wbcat-body">
                            {cat.entries.map(e => (
                              <div key={e.id} className="wbe">
                                <div className="wbe-hdr">
                                  <span className="wbe-name" onClick={() => { setEditingEntry({catId:cat.id,entryId:e.id}); setEntryForm({name:e.name,keywords:e.keywords.join(", "),content:e.content,enabled:e.enabled}); }}>{e.name}</span>
                                  <div className="wbe-acts">
                                    <button className={`wtog ${e.enabled?"on":"off"}`} onClick={() => setWbCats(cs=>cs.map(c=>c.id===cat.id?{...c,entries:c.entries.map(x=>x.id===e.id?{...x,enabled:!x.enabled}:x)}:c))}><div className="wtog-dot"/></button>
                                    <button className="wdel" onClick={() => setWbCats(cs=>cs.map(c=>c.id===cat.id?{...c,entries:c.entries.filter(x=>x.id!==e.id)}:c))}>×</button>
                                  </div>
                                </div>
                                <div className="wkw">🔑 {e.keywords.join(" / ") || "无关键词"}</div>
                                <div className="wprev">{e.content.slice(0,50)}{e.content.length>50?"…":""}</div>
                              </div>
                            ))}
                            <button className="btn-addwb" onClick={() => { setEditingEntry({catId:cat.id,entryId:"new"}); setEntryForm({name:"",keywords:"",content:"",enabled:true}); }}>+ 添加条目</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="btn-addcat" onClick={() => { setEditingCat("new"); setCatForm({name:""}); }}>＋ 新建分类</button>
                  <div className="pactions">
                    <button className="bsec" onClick={() => setShowSettings(false)}>关闭</button>
                    <button className="bsave" onClick={save}>保存</button>
                  </div>
                </>}

                {/* Memory */}
                {sTab === "memory" && <>
                  <div className="hint-box">💡 注入优先级：角色卡 → 用户设定 → 世界书 → 长期记忆 → 当前时间</div>
                  <div className="num-row"><label>每隔多少条消息自动总结</label><input className="num-input" type="number" min={5} max={200} value={memTrigger} onChange={e => setMemTrigger(parseInt(e.target.value)||20)} /></div>
                  <div className="num-row"><label>每次发送读取最近几轮上下文</label><input className="num-input" type="number" min={5} max={100} value={memContext} onChange={e => setMemContext(parseInt(e.target.value)||30)} /></div>
                  <div className="memcard">
                    <div className="memcard-t"><span>🧠 当前长期记忆</span><span style={{fontWeight:400,color:"#aaa",fontSize:11}}>{memSummary?`${memSummary.length}字`:"空"}</span></div>
                    {memEditing ? <textarea className="mem-edit" value={memDraft} onChange={e => setMemDraft(e.target.value)} /> : <div className="memtxt" style={!memSummary?{color:"#ccc"}:{}}>{memSummary || `还没有记忆～对话满${memTrigger}条后自动生成`}</div>}
                  </div>
                  <div className="pactions" style={{marginBottom:10}}>
                    {memEditing
                      ? <><button className="bsec" onClick={() => setMemEditing(false)}>取消</button><button className="bsave" onClick={async () => { setMemSummary(memDraft); await store.set("ymem",memDraft); setMemEditing(false); }}>保存记忆</button></>
                      : <><button className="fbtn" onClick={() => { setMemDraft(memSummary); setMemEditing(true); }}>✏️ 编辑</button><button className="fbtn" onClick={() => summarize(messages,true)} disabled={summarizing}>{summarizing?"总结中…":"🔄 手动总结"}</button><button className="bdanger" onClick={async () => { setMemSummary(""); await store.set("ymem",""); }}>清除</button></>
                    }
                  </div>
                  <div className="pactions"><button className="bsec" onClick={() => setShowSettings(false)}>关闭</button><button className="bsave" onClick={save}>保存设置</button></div>
                </>}

                {/* Interact */}
                {sTab === "interact" && <>
                  <div className="scard">
                    <div className="scard-t">✉️ 多条连发</div>
                    <div style={{fontSize:12,color:"#888",lineHeight:1.7}}>点击输入栏左边的 ＋ 展开工具栏，再点✉️开启连发模式。每条消息立即显示在聊天里，点"✓ 说完了"后{charName}才统一回复。</div>
                  </div>
                  <div className="scard">
                    <div className="scard-t">💬 抢话模式</div>
                    <div style={{fontSize:12,color:"#888",marginBottom:10,lineHeight:1.7}}>你停止输入超过设定秒数，{charName}自动插话回复。</div>
                    <div className="num-row"><label>停顿多少秒触发</label><input className="num-input" type="number" min={1} max={30} value={interruptDelay} onChange={e => setInterruptDelay(parseInt(e.target.value)||4)} /></div>
                    <div style={{display:"flex",gap:6}}>
                      <button className={`ptab ${interruptOn?"active":""}`} style={{flex:1}} onClick={() => setInterruptOn(true)}>开启</button>
                      <button className={`ptab ${!interruptOn?"active":""}`} style={{flex:1}} onClick={() => setInterruptOn(false)}>关闭</button>
                    </div>
                  </div>
                  <div className="scard">
                    <div className="scard-t">❤️ 气泡反应</div>
                    <div style={{fontSize:12,color:"#888",lineHeight:1.7}}>长按任意消息气泡，弹出反应选择器，支持 {REACTION_EMOJIS.join(" ")} 等表情。</div>
                  </div>
                  <div className="pactions"><button className="bsec" onClick={() => setShowSettings(false)}>关闭</button><button className="bsave" onClick={save}>保存</button></div>
                </>}
              </div>
            </div>
          )}

          {/* Entry Edit */}
          {showSettings && editingEntry && (
            <div className="overlay"><div className="panel">
              <div className="ph"/><div className="ptitle">{editingEntry.entryId==="new"?"新建条目":"编辑条目"}</div>
              <label className="fl">名称</label><input className="fi" value={entryForm.name} onChange={e=>setEntryForm(f=>({...f,name:e.target.value}))} placeholder="北海道约定" />
              <label className="fl">关键词（逗号分隔）</label><input className="fi" value={entryForm.keywords} onChange={e=>setEntryForm(f=>({...f,keywords:e.target.value}))} placeholder="北海道, 旅行" />
              <label className="fl">注入内容</label><textarea className="fta" style={{minHeight:120}} value={entryForm.content} onChange={e=>setEntryForm(f=>({...f,content:e.target.value}))} placeholder="余乐和Jasmine约定了…" />
              <div className="pactions"><button className="bsec" onClick={()=>setEditingEntry(null)}>取消</button><button className="bsave" onClick={saveEntry}>保存</button></div>
            </div></div>
          )}

          {/* Cat Edit */}
          {showSettings && editingCat && (
            <div className="overlay"><div className="panel">
              <div className="ph"/><div className="ptitle">{editingCat==="new"?"新建分类":"重命名分类"}</div>
              <label className="fl">分类名称</label><input className="fi" value={catForm.name} onChange={e=>setCatForm({name:e.target.value})} placeholder="角色设定 / 功能型…" />
              <div className="pactions"><button className="bsec" onClick={()=>setEditingCat(null)}>取消</button><button className="bsave" onClick={saveCat}>保存</button></div>
            </div></div>
          )}
        </div>
      </div>
    </div>
  );
}