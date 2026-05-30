const sampleText = `A: 안녕하세요
B: 안녕하세요`;

const colors = ["#5865f2", "#eb459e", "#57f287", "#fee75c", "#ed4245", "#00a8fc"];
let profiles = {};
let csvRows = [];
let csvHeaders = [];
let revealCount = null;
let playTimer = null;

const $ = (selector) => document.querySelector(selector);
const els = {
  csvInput: $("#csvInput"),
  csvTools: $("#csvTools"),
  nameColumn: $("#nameColumn"),
  messageColumn: $("#messageColumn"),
  timeColumn: $("#timeColumn"),
  exportPng: $("#exportPng"),
  exportVideo: $("#exportVideo"),
  loadSample: $("#loadSample"),
  addProfile: $("#addProfile"),
  channelName: $("#channelName"),
  channelTitle: $("#channelTitle"),
  chatInput: $("#chatInput"),
  chatWidth: $("#chatWidth"),
  playPreview: $("#playPreview"),
  previewScrubber: $("#previewScrubber"),
  discordFrame: $("#discordFrame"),
  messageList: $("#messageList"),
  profileList: $("#profileList"),
  statusText: $("#statusText"),
};

function parseChat(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const divider = line.indexOf(":");
      const fallbackName = index % 2 === 0 ? "A 스트리머" : "B 스트리머";
      if (divider === -1) {
        return { name: fallbackName, text: line, time: makeTime(index) };
      }
      return {
        name: line.slice(0, divider).trim() || fallbackName,
        ...parseMessageBody(line.slice(divider + 1).trim(), index),
      };
    });
}

function parseMessageBody(body, index) {
  const timeMatch = body.match(/\s+\[([^\]]+)\]$/);
  if (!timeMatch) return { text: body, time: makeTime(index) };
  return {
    text: body.slice(0, timeMatch.index).trim(),
    time: timeMatch[1],
  };
}

function parseCsv(text) {
  const result = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) result.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) result.push(row);
  return result;
}

function loadCsv(text) {
  const parsed = parseCsv(text);
  csvHeaders = parsed[0] || [];
  csvRows = parsed.slice(1).map((cells) =>
    Object.fromEntries(csvHeaders.map((header, index) => [header, cells[index] || ""])),
  );
  hydrateColumnSelects();
  applyCsvColumns();
}

function hydrateColumnSelects() {
  const options = csvHeaders.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join("");
  [els.nameColumn, els.messageColumn, els.timeColumn].forEach((select) => {
    select.innerHTML = options;
  });
  els.nameColumn.value = guessColumn(["name", "이름", "닉네임", "author", "speaker"]);
  els.messageColumn.value = guessColumn(["message", "text", "대사", "메시지", "내용"]);
  els.timeColumn.value = guessColumn(["time", "start", "시간", "시작"]);
  els.csvTools.hidden = !csvHeaders.length;
}

function guessColumn(candidates) {
  const found = csvHeaders.find((header) => candidates.some((word) => header.toLowerCase().includes(word)));
  return found || csvHeaders[0] || "";
}

function applyCsvColumns() {
  const nameKey = els.nameColumn.value;
  const messageKey = els.messageColumn.value;
  const timeKey = els.timeColumn.value;
  els.chatInput.value = csvRows
    .map((row, index) => {
      const name = row[nameKey] || (index % 2 === 0 ? "A 스트리머" : "B 스트리머");
      const text = row[messageKey] || "";
      const time = row[timeKey] || "";
      return time ? `${name}: ${text} [${time}]` : `${name}: ${text}`;
    })
    .join("\n");
  revealCount = null;
  stopPreview();
  render();
}

function syncProfiles(messages) {
  messages.forEach((message) => {
    if (profiles[message.name]) return;
    const index = Object.keys(profiles).length;
    profiles[message.name] = {
      id: crypto.randomUUID(),
      name: message.name,
      displayName: message.name,
      color: colors[index % colors.length],
      avatar: "",
    };
  });
}

function render() {
  const messages = parseChat(els.chatInput.value);
  syncProfiles(messages);
  const visibleCount = revealCount === null ? messages.length : Math.min(revealCount, messages.length);
  const visibleMessages = messages.slice(0, visibleCount);

  els.channelTitle.textContent = els.channelName.value || "채팅";
  els.discordFrame.style.setProperty("--chat-width", `${els.chatWidth.value}px`);
  els.statusText.textContent = `${messages.length}개 메시지, ${Object.keys(profiles).length}개 프로필`;
  els.previewScrubber.max = String(messages.length);
  els.previewScrubber.value = String(visibleCount);
  renderProfiles();
  renderMessages(visibleMessages);
}

function renderProfiles() {
  els.profileList.innerHTML = Object.values(profiles)
    .map((profile) => {
      const avatar = profile.avatar
        ? `<img src="${profile.avatar}" alt="" />`
        : `<span>${escapeHtml(initial(profile.displayName))}</span>`;
      return `<article class="profile-card" data-name="${escapeHtml(profile.name)}">
        <button class="avatar-button" type="button" style="background:${profile.color}" aria-label="${escapeHtml(profile.displayName)} 프로필 사진 설정">${avatar}</button>
        <div class="profile-fields">
          <input class="display-name" type="text" value="${escapeHtml(profile.displayName)}" aria-label="표시 이름" />
          <input class="avatar-file file-input" type="file" accept="image/*" />
        </div>
        <div class="profile-actions">
          <button class="small-button clear-avatar" type="button" title="프로필 사진 지우기">×</button>
          <button class="small-button danger remove-profile" type="button" title="프로필 삭제">삭제</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderMessages(messages) {
  if (!messages.length) {
    els.messageList.innerHTML = `<p class="empty">대화 내용을 입력하면 디스코드 채팅 내역이 생성됩니다.</p>`;
    return;
  }

  els.messageList.innerHTML = messages
    .map((message, index) => {
      const previous = messages[index - 1];
      const profile = profiles[message.name];
      const compact = previous?.name === message.name;
      const avatar = profile.avatar
        ? `<img src="${profile.avatar}" alt="" />`
        : `<span>${escapeHtml(initial(profile.displayName))}</span>`;

      if (compact) {
        return `<article class="message compact">
          <span class="avatar" style="background:${profile.color}">${avatar}</span>
          <div><p>${escapeHtml(message.text)}</p></div>
        </article>`;
      }

      return `<article class="message">
        <span class="avatar" style="background:${profile.color}">${avatar}</span>
        <div>
          <div class="message-meta">
            <strong>${escapeHtml(profile.displayName)}</strong>
            <time>${message.time}</time>
          </div>
          <p>${escapeHtml(message.text)}</p>
        </div>
      </article>`;
    })
    .join("");
}

async function exportPng() {
  const canvas = await renderDiscordCanvas(parseChat(els.chatInput.value));
  canvas.toBlob((blob) => downloadBlob(blob, `discord-chat-log-${Date.now()}.png`), "image/png");
}

async function exportVideo() {
  if (!("MediaRecorder" in window)) {
    alert("이 브라우저는 WebM 저장을 지원하지 않습니다.");
    return;
  }

  const messages = parseChat(els.chatInput.value);
  if (!messages.length) return;

  const width = Number(els.chatWidth.value);
  const fullHeight = getCanvasHeight(messages, width);
  const recordingCanvas = document.createElement("canvas");
  recordingCanvas.width = width * 2;
  recordingCanvas.height = fullHeight * 2;
  const ctx = recordingCanvas.getContext("2d");
  const stream = recordingCanvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  recorder.start();
  for (let i = 1; i <= messages.length; i += 1) {
    const frame = await renderDiscordCanvas(messages.slice(0, i), { width, fixedHeight: fullHeight });
    ctx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    ctx.drawImage(frame, 0, 0);
    await wait(850);
  }
  await wait(450);
  recorder.stop();
  await new Promise((resolve) => {
    recorder.onstop = resolve;
  });
  downloadBlob(new Blob(chunks, { type: "video/webm" }), `discord-chat-log-${Date.now()}.webm`);
}

async function renderDiscordCanvas(messages, options = {}) {
  const width = options.width || Number(els.chatWidth.value);
  const height = options.fixedHeight || getCanvasHeight(messages, width);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#313338";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#313338";
  ctx.fillRect(0, 0, width, 48);
  ctx.strokeStyle = "#27292f";
  ctx.beginPath();
  ctx.moveTo(0, 48);
  ctx.lineTo(width, 48);
  ctx.stroke();
  ctx.fillStyle = "#80848e";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText("#", 18, 33);
  ctx.fillStyle = "#f2f3f5";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText(els.channelName.value || "채팅", 50, 30);

  let y = 68;
  messages.forEach((message, index) => {
    const profile = profiles[message.name];
    const compact = messages[index - 1]?.name === message.name;
    if (!compact) {
      drawAvatar(ctx, profile, 18, y + 2, 40);
      ctx.fillStyle = "#f2f3f5";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText(profile.displayName, 72, y + 15);
      ctx.fillStyle = "#80848e";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(message.time, 72 + Math.min(180, ctx.measureText(profile.displayName).width + 10), y + 15);
      y += 24;
    } else {
      y += 4;
    }

    ctx.fillStyle = "#dbdee1";
    ctx.font = "15px system-ui, sans-serif";
    const lines = wrapForCanvas(message.text, width - 96, 15);
    lines.forEach((line) => {
      ctx.fillText(line, 72, y + 16);
      y += 22;
    });
    y += compact ? 4 : 16;
  });

  return canvas;
}

function getCanvasHeight(messages, width) {
  const rowHeights = messages.map((message, index) => {
    const compact = messages[index - 1]?.name === message.name;
    const lines = wrapForCanvas(message.text, compact ? width - 96 : width - 112, 15);
    return (compact ? 24 : 50) + Math.max(1, lines.length) * 22;
  });
  return Math.max(220, 62 + rowHeights.reduce((sum, value) => sum + value, 0) + 26);
}

function drawAvatar(ctx, profile, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = profile.color;
  ctx.fillRect(x, y, size, size);
  if (profile.avatar) {
    const image = document.querySelector(`[data-name="${cssEscape(profile.name)}"] .avatar-button img`);
    if (image?.complete) ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = "900 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial(profile.displayName), x + size / 2, y + size / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

function addProfile() {
  const name = `스트리머 ${Object.keys(profiles).length + 1}`;
  profiles[name] = {
    id: crypto.randomUUID(),
    name,
    displayName: name,
    color: colors[Object.keys(profiles).length % colors.length],
    avatar: "",
  };
  render();
}

function playPreview() {
  const messages = parseChat(els.chatInput.value);
  if (!messages.length) return;
  stopPreview(false);
  revealCount = 0;
  els.playPreview.textContent = "Ⅱ";
  playTimer = window.setInterval(() => {
    revealCount += 1;
    if (revealCount >= messages.length) {
      revealCount = messages.length;
      stopPreview();
    }
    render();
  }, 700);
  render();
}

function stopPreview(resetLabel = true) {
  window.clearInterval(playTimer);
  playTimer = null;
  if (resetLabel) els.playPreview.textContent = "▶";
}

function makeTime(index) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + index);
  return `오늘 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function wrapForCanvas(text, maxWidth, fontSize) {
  const canvas = wrapForCanvas.canvas || (wrapForCanvas.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const chars = [...String(text)];
  const lines = [];
  let line = "";
  chars.forEach((char) => {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function initial(name = "") {
  return [...String(name).trim()][0] || "?";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

els.csvInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  loadCsv(await file.text());
});

[els.nameColumn, els.messageColumn, els.timeColumn].forEach((select) => {
  select.addEventListener("change", applyCsvColumns);
});

els.chatInput.addEventListener("input", () => {
  revealCount = null;
  stopPreview();
  render();
});
els.channelName.addEventListener("input", render);
els.chatWidth.addEventListener("input", render);
els.previewScrubber.addEventListener("input", (event) => {
  stopPreview();
  revealCount = Number(event.target.value);
  render();
});
els.loadSample.addEventListener("click", () => {
  els.chatInput.value = sampleText;
  revealCount = null;
  stopPreview();
  render();
});
els.addProfile.addEventListener("click", addProfile);
els.exportPng.addEventListener("click", exportPng);
els.exportVideo.addEventListener("click", exportVideo);
els.playPreview.addEventListener("click", () => {
  if (playTimer) {
    stopPreview();
  } else {
    playPreview();
  }
});

els.profileList.addEventListener("click", (event) => {
  const card = event.target.closest(".profile-card");
  if (!card) return;
  const profile = profiles[card.dataset.name];
  if (event.target.closest(".avatar-button")) {
    card.querySelector(".avatar-file").click();
  }
  if (event.target.closest(".clear-avatar")) {
    profile.avatar = "";
    render();
  }
  if (event.target.closest(".remove-profile")) {
    delete profiles[card.dataset.name];
    render();
  }
});

els.profileList.addEventListener("input", async (event) => {
  const card = event.target.closest(".profile-card");
  if (!card) return;
  const profile = profiles[card.dataset.name];

  if (event.target.classList.contains("display-name")) {
    profile.displayName = event.target.value;
    renderMessages(parseChat(els.chatInput.value));
  }

  if (event.target.classList.contains("avatar-file")) {
    const file = event.target.files[0];
    if (!file) return;
    profile.avatar = await readFileAsDataUrl(file);
    render();
  }
});

document.querySelectorAll("[data-mobile-tab]").forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    const target = tabButton.dataset.mobileTab;
    document.querySelectorAll("[data-mobile-tab]").forEach((button) => {
      button.classList.toggle("active", button === tabButton);
    });
    document.querySelectorAll("[data-mobile-section]").forEach((section) => {
      section.classList.toggle("active", section.dataset.mobileSection === target);
    });
  });
});

els.chatInput.value = sampleText;
render();
