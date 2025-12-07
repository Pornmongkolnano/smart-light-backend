(function () {
  const state = { timer: null };
  const STALE_MS = 12000;
  const refs = {
    statusText: document.querySelector('[data-status-text]'),
    connection: document.querySelector('[data-connection]'),
    health: document.querySelector('[data-health]'),
    light: document.querySelector('[data-light]'),
    ldr: document.querySelector('[data-ldr]'),
    noise: document.querySelector('[data-noise]'),
    distance: document.querySelector('[data-distance]'),
    extraList: document.querySelector('[data-extra-list]'),
    summaryText: document.querySelector('[data-quick-summary]'),
    refreshBtn: document.getElementById('refreshBtn'),
  };

  const primaryFields = ['LIGHT', 'LDR', 'DIST', 'NOISE'];

  function setBadge(status, message) {
    const classList = refs.connection.classList;
    classList.remove('online', 'offline');
    classList.add(status ? 'online' : 'offline');
    refs.statusText.textContent = message || (status ? 'รับข้อมูลจาก NETPIE แล้ว' : 'กำลังรอข้อมูล');
  }

  function formatLight(val) {
    if (val === undefined || val === null) return '—';
    if (val === true || val === 1 || val === '1' || val === 'ON') return 'เปิด';
    if (val === false || val === 0 || val === '0' || val === 'OFF') return 'ปิด';
    return String(val);
  }

  function formatDistance(val) {
    if (val === undefined || val === null || val === '') return '—';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return num.toFixed(1) + ' cm';
  }

  function formatLdr(val) {
    if (val === undefined || val === null || val === '') return '—';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return num;
  }

  function formatNoise(val) {
    if (val === undefined || val === null || val === '') return '—';
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
    return String(val);
  }

  function updateExtras(data) {
    refs.extraList.innerHTML = '';
    const entries = Object.entries(data || {}).filter(([key]) => !primaryFields.includes(key));
    if (!entries.length) {
      refs.extraList.innerHTML = '<li class="muted">ยังไม่มีข้อมูลเพิ่มเติม</li>';
      return;
    }
    entries.forEach(([key, value]) => {
      const li = document.createElement('li');
      const keySpan = document.createElement('span');
      keySpan.className = 'key';
      keySpan.textContent = key;
      const valSpan = document.createElement('span');
      valSpan.className = 'val';
      valSpan.textContent = typeof value === 'object' ? JSON.stringify(value) : value;
      li.append(keySpan, valSpan);
      refs.extraList.appendChild(li);
    });
  }

  function buildSummary(light, ldr, distance, noise, dataStatus) {
    const parts = [];
    if (light !== '—') parts.push('หลอดไฟ ' + light);
    if (ldr !== '—') parts.push('แสง ' + ldr);
    if (distance !== '—') parts.push('ระยะ ' + distance);
    if (noise !== '—') parts.push('เสียง ' + noise);
    if (!dataStatus) {
      return parts.length ? parts.join(' • ') : 'รอข้อมูลจากอุปกรณ์...';
    }
    if (!parts.length) return dataStatus;
    return parts.join(' • ') + ' • ' + dataStatus;
  }

  function render(payload) {
    const ok = payload && payload.ok && payload.data;
    const updatedAt = ok && payload.updatedAt ? new Date(payload.updatedAt) : null;
    const ageMs = updatedAt ? Date.now() - updatedAt.getTime() : Infinity;
    const ageSec = Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : null;
    const isFresh = ok && ageMs < STALE_MS;

    const statusMessage = !ok
      ? 'กำลังรอข้อมูล'
      : isFresh
        ? 'รับข้อมูลจาก NETPIE แล้ว'
        : ageSec !== null
          ? `ข้อมูลไม่อัปเดตเกิน ${ageSec} วินาที`
          : 'ข้อมูลยังไม่อัปเดต';

    setBadge(isFresh, statusMessage);

    refs.health.textContent = !ok ? 'Waiting' : isFresh ? 'Live' : 'Stale';
    refs.health.className = 'chip ' + (!ok ? 'warn' : isFresh ? 'good' : 'warn');

    const data = ok ? payload.data : {};

    const light = formatLight(data.LIGHT);
    const ldr = formatLdr(data.LDR);
    const distance = formatDistance(data.DIST);
    const noise = formatNoise(data.NOISE);

    refs.light.textContent = light;
    refs.ldr.textContent = ldr;
    refs.distance.textContent = distance;
    refs.noise.textContent = noise;

    if (refs.summaryText) {
      const dataStatus = !ok ? 'รอข้อมูล' : isFresh ? 'ข้อมูลกำลังอัปเดต' : 'ข้อมูลหยุดอัปเดต';
      refs.summaryText.textContent = buildSummary(light, ldr, distance, noise, dataStatus);
    }

    updateExtras(data);
  }

  async function fetchStatus(manual = false) {
    if (manual) {
      refs.refreshBtn.disabled = true;
      refs.refreshBtn.textContent = 'กำลังโหลด...';
    }
    try {
      const res = await fetch('/status');
      if (!res.ok) throw new Error('Bad response ' + res.status);
      const payload = await res.json();
      render(payload);
    } catch (err) {
      refs.health.textContent = 'Disconnected';
      refs.health.className = 'chip bad';
      setBadge(false, 'เชื่อมต่อไม่ได้');
    } finally {
      if (manual) {
        refs.refreshBtn.disabled = false;
        refs.refreshBtn.textContent = 'รีเฟรช';
      }
    }
  }

  refs.refreshBtn.addEventListener('click', () => fetchStatus(true));
  fetchStatus();
  state.timer = setInterval(fetchStatus, 2000);
})();
