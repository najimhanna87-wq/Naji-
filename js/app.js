/* =========================================================
   Naji TV — منطق تطبيق IPTV
   يدعم: تحميل قائمة M3U، تشغيل HLS، التنقل بالريموت (D-pad)
   متوافق مع: Vidaa (Hisense) / webOS (LG) / المتصفحات
   ========================================================= */
(function () {
  "use strict";

  // ------- الإعدادات -------
  // ضع رابط قائمة M3U الخاصة بك هنا (playlist.m3u) أو ملف محلي
  var PLAYLIST_URL = "playlist.m3u";

  // ------- الحالة -------
  var state = {
    channels: [],          // كل القنوات
    categories: [],        // أسماء التصنيفات
    channelsByCat: {},     // تصنيف -> قنوات
    currentCat: null,
    focus: "categories",   // العنصر المركّز: categories | channels | player
    catIndex: 0,
    chIndex: 0,
    playingId: null
  };

  var hls = null;

  // ------- عناصر DOM -------
  var el = {};
  function $(id) { return document.getElementById(id); }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    el.splash   = $("splash");
    el.app      = $("app");
    el.cats     = $("categories");
    el.chans    = $("channels");
    el.video    = $("video");
    el.nowPlay  = $("nowPlaying");
    el.overlay  = $("playerOverlay");
    el.error    = $("playerError");
    el.toast    = $("toast");

    bindKeys();
    loadPlaylist(PLAYLIST_URL);
  }

  // ===============================================
  //  تحميل وتحليل قائمة M3U
  // ===============================================
  function loadPlaylist(url) {
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (text) {
        var ch = parseM3U(text);
        if (!ch.length) throw new Error("empty");
        setupData(ch);
        showApp();
      })
      .catch(function (err) {
        // في حال عدم وجود قائمة، نعرض قنوات تجريبية مفتوحة المصدر
        console.warn("تعذّر تحميل القائمة:", err);
        setupData(demoChannels());
        showApp();
        toast("لم يتم العثور على playlist.m3u — تعرض قنوات تجريبية");
      });
  }

  // محلّل M3U قياسي (يدعم tvg-logo, group-title, tvg-name)
  function parseM3U(text) {
    var lines = text.split(/\r?\n/);
    var out = [];
    var cur = null;
    var id = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("#EXTINF") === 0) {
        cur = {
          id: ++id,
          name: extractName(line),
          logo: attr(line, "tvg-logo"),
          group: attr(line, "group-title") || "عام"
        };
      } else if (line.charAt(0) !== "#" && cur) {
        cur.url = line;
        out.push(cur);
        cur = null;
      }
    }
    return out;
  }

  function attr(line, key) {
    var m = line.match(new RegExp(key + '="([^"]*)"'));
    return m ? m[1] : "";
  }
  function extractName(line) {
    var comma = line.lastIndexOf(",");
    return comma > -1 ? line.slice(comma + 1).trim() : "قناة";
  }

  function setupData(channels) {
    state.channels = channels;
    state.channelsByCat = {};
    state.categories = [];
    channels.forEach(function (c) {
      if (!state.channelsByCat[c.group]) {
        state.channelsByCat[c.group] = [];
        state.categories.push(c.group);
      }
      state.channelsByCat[c.group].push(c);
    });
    state.currentCat = state.categories[0];
  }

  // ===============================================
  //  العرض (Rendering)
  // ===============================================
  function showApp() {
    el.splash.classList.add("hidden");
    el.app.classList.remove("hidden");
    renderCategories();
    renderChannels();
    updateFocus();
  }

  function renderCategories() {
    el.cats.innerHTML = "";
    state.categories.forEach(function (cat, i) {
      var d = document.createElement("div");
      d.className = "cat-item" + (cat === state.currentCat ? " active" : "");
      d.textContent = cat;
      d.dataset.index = i;
      d.addEventListener("click", function () {
        state.catIndex = i; state.focus = "categories";
        selectCategory(cat); updateFocus();
      });
      el.cats.appendChild(d);
    });
  }

  function renderChannels() {
    el.chans.innerHTML = "";
    var list = state.channelsByCat[state.currentCat] || [];
    list.forEach(function (ch, i) {
      var row = document.createElement("div");
      row.className = "channel-item" + (ch.id === state.playingId ? " playing" : "");
      row.dataset.index = i;

      var logo = document.createElement("div");
      logo.className = "channel-logo";
      if (ch.logo) logo.style.backgroundImage = "url('" + ch.logo + "')";
      else logo.textContent = ch.name.charAt(0);

      var name = document.createElement("div");
      name.className = "channel-name";
      name.textContent = ch.name;

      row.appendChild(logo);
      row.appendChild(name);
      row.addEventListener("click", function () {
        state.chIndex = i; state.focus = "channels";
        playChannel(ch); updateFocus();
      });
      el.chans.appendChild(row);
    });
  }

  function selectCategory(cat) {
    state.currentCat = cat;
    state.chIndex = 0;
    renderCategories();
    renderChannels();
  }

  // ===============================================
  //  التنقل بالريموت (D-pad)
  // ===============================================
  // أكواد المفاتيح تغطي المتصفح + Vidaa + webOS + LG magic remote
  var KEY = {
    LEFT: [37], RIGHT: [39], UP: [38], DOWN: [40],
    OK: [13, 29443], BACK: [8, 461, 10009, 27], // Back/Return/Escape
    PLAY: [415, 19], PAUSE: [19, 413], STOP: [413]
  };
  function isKey(code, name) { return KEY[name].indexOf(code) > -1; }

  function bindKeys() {
    document.addEventListener("keydown", function (e) {
      var code = e.keyCode;
      var handled = true;

      if (isKey(code, "BACK")) {
        onBack();
      } else if (state.focus === "categories") {
        if (isKey(code, "DOWN"))      moveCat(1);
        else if (isKey(code, "UP"))   moveCat(-1);
        else if (isKey(code, "LEFT")) enterChannels(); // RTL: يسار = دخول القائمة
        else if (isKey(code, "OK"))   enterChannels();
        else handled = false;
      } else if (state.focus === "channels") {
        if (isKey(code, "DOWN"))       moveChannel(1);
        else if (isKey(code, "UP"))    moveChannel(-1);
        else if (isKey(code, "RIGHT")) { state.focus = "categories"; updateFocus(); }
        else if (isKey(code, "OK"))    playCurrent();
        else if (isKey(code, "LEFT"))  { state.focus = "player"; updateFocus(); }
        else handled = false;
      } else if (state.focus === "player") {
        if (isKey(code, "OK") || isKey(code, "PLAY") || isKey(code, "PAUSE")) togglePlay();
        else if (isKey(code, "RIGHT")) { state.focus = "channels"; updateFocus(); }
        else handled = false;
      } else handled = false;

      if (handled) { e.preventDefault(); e.stopPropagation(); }
    });
  }

  function moveCat(dir) {
    var n = state.categories.length;
    state.catIndex = (state.catIndex + dir + n) % n;
    selectCategory(state.categories[state.catIndex]);
    updateFocus();
  }
  function enterChannels() {
    var list = state.channelsByCat[state.currentCat] || [];
    if (!list.length) return;
    state.focus = "channels";
    updateFocus();
  }
  function moveChannel(dir) {
    var list = state.channelsByCat[state.currentCat] || [];
    if (!list.length) return;
    state.chIndex = (state.chIndex + dir + list.length) % list.length;
    updateFocus();
  }
  function playCurrent() {
    var list = state.channelsByCat[state.currentCat] || [];
    var ch = list[state.chIndex];
    if (ch) playChannel(ch);
  }
  function onBack() {
    if (state.focus === "player") { state.focus = "channels"; updateFocus(); }
    else if (state.focus === "channels") { state.focus = "categories"; updateFocus(); }
    // من التصنيفات: نترك للنظام إغلاق التطبيق (لا نمنع)
  }

  // تحديث التمييز البصري + التمرير التلقائي
  function updateFocus() {
    clearFocus(el.cats, ".cat-item");
    clearFocus(el.chans, ".channel-item");

    if (state.focus === "categories") {
      var c = el.cats.children[state.catIndex];
      if (c) { c.classList.add("focused"); scrollIntoView(c, el.cats); }
    } else if (state.focus === "channels") {
      var ch = el.chans.children[state.chIndex];
      if (ch) { ch.classList.add("focused"); scrollIntoView(ch, el.chans); }
    }
    el.overlay.classList.toggle("dim", state.focus !== "player");
  }
  function clearFocus(root, sel) {
    var nodes = root.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove("focused");
  }
  function scrollIntoView(node, container) {
    var top = node.offsetTop, bottom = top + node.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top - 12;
    else if (bottom > container.scrollTop + container.clientHeight)
      container.scrollTop = bottom - container.clientHeight + 12;
  }

  // ===============================================
  //  تشغيل الفيديو (HLS / native)
  // ===============================================
  function playChannel(ch) {
    state.playingId = ch.id;
    state.focus = "player";
    el.error.classList.add("hidden");
    el.nowPlay.textContent = ch.name;
    renderChannels();
    updateFocus();
    play(ch.url);
    toast("جاري تشغيل: " + ch.name);
  }

  function play(url) {
    var video = el.video;
    destroyHls();

    var isHls = /\.m3u8(\?|$)/i.test(url);
    var canNative = video.canPlayType("application/vnd.apple.mpegurl");

    if (isHls && window.Hls && window.Hls.isSupported() && !window.__noHls) {
      hls = new window.Hls({ maxBufferLength: 30, liveSyncDurationCount: 3 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { safePlay(video); });
      hls.on(window.Hls.Events.ERROR, function (e, data) {
        if (data && data.fatal) showError("تعذّر تشغيل البث. تأكد من صحة الرابط أو الاتصال.");
      });
    } else {
      // تشغيل أصلي: أغلب تلفزيونات Vidaa/webOS تدعم HLS و MP4 مباشرة
      video.src = url;
      safePlay(video);
      video.onerror = function () {
        showError("تعذّر تشغيل هذه القناة على هذا الجهاز.");
      };
    }
  }
  function safePlay(video) {
    var p = video.play();
    if (p && p.catch) p.catch(function () {/* بعض الأجهزة تتطلب تفاعل — نتجاهل */});
  }
  function togglePlay() {
    if (el.video.paused) safePlay(el.video); else el.video.pause();
  }
  function destroyHls() { if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } }
  function showError(msg) { el.error.textContent = msg; el.error.classList.remove("hidden"); }

  // ===============================================
  //  أدوات مساعدة
  // ===============================================
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.add("hidden"); }, 2600);
  }

  // قنوات تجريبية (بث HLS تجريبي مفتوح) — استبدلها بقائمتك
  function demoChannels() {
    return [
      { id: 1, name: "Big Buck Bunny", group: "تجريبي", logo: "",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
      { id: 2, name: "Apple Basic Stream", group: "تجريبي", logo: "",
        url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8" },
      { id: 3, name: "Sintel Trailer (MP4)", group: "أفلام", logo: "",
        url: "https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4" }
    ];
  }
})();
