(function () {
  const state = { timer: null };
  const refs = {
    statusText: document.querySelector('[data-status-text]'),
    connection: document.querySelector('[data-connection]'),
    health: document.querySelector('[data-health]'),
    lastUpdate: document.querySelector('[data-last-update]'),
    light: document.querySelector('[data-light]'),
    ldr: document.querySelector('[data-ldr]'),
    noise: document.querySelector('[data-noise]'),
    distance: document.querySelector('[data-distance]'),
    lightDetail: document.querySelector('[data-light-detail]'),
    ldrDetail: document.querySelector('[data-ldr-detail]'),
    noiseDetail: document.querySelector('[data-noise-detail]'),
    distanceDetail: document.querySelector('[data-distance-detail]'),
    extraList: document.querySelector('[data-extra-list]'),
    refreshBtn: document.getElementById('refreshBtn'),
  };

  const primaryFields = ['LIGHT', 'LDR', 'DIST', 'NOISE'];

  function setBadge(status) {
    const classList = refs.connection.classList;
    classList.remove('online', 'offline');
    classList.add(status ? 'online' : 'offline');
    refs.statusText.textContent = status ? 'รับข้อมูลจาก NETPIE แล้ว' : 'กำลังรอข้อมูล';
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
    return Number(val);
  }

  function formatNoise(val) {
    if (val === undefined || val === null || val === '') return '—';
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
    return String(val);
  }

  function relativeTime(date) {
    const diff = Date.now() - date.getTime();
    if (diff < 0) return 'เพิ่งอัปเดต';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return seconds + ' วินาทีที่แล้ว';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' นาทีที่แล้ว';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' ชั่วโมงที่แล้ว';
    const days = Math.floor(hours / 24);
    return days + ' วันที่แล้ว';
  }

  function updateExtras(data) {
    refs.extraList.innerHTML = '';
    const entries = Object.entries(data || {}).filter(([key]) => !primaryFields.includes(key));
    if (!entries.length) {
      refs.extraList.innerHTML = '<li class="muted">ยังไม่มีข้อมูลอื่นเพิ่มเติม</li>';
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

  function render(payload) {
    const ok = payload && payload.ok && payload.data;
    setBadge(Boolean(ok));

    refs.health.textContent = ok ? 'Live' : 'Waiting';
    refs.health.className = 'chip ' + (ok ? 'good' : 'warn');

    const data = ok ? payload.data : {};
    const updated = ok && payload.updatedAt ? new Date(payload.updatedAt) : null;
    refs.lastUpdate.textContent = updated ? relativeTime(updated) : 'ยังไม่เคยได้รับข้อมูล';

    const light = formatLight(data.LIGHT);
    const ldr = formatLdr(data.LDR);
    const distance = formatDistance(data.DIST);
    const noise = formatNoise(data.NOISE);

    refs.light.textContent = light;
    refs.lightDetail.textContent = light;
    refs.ldr.textContent = ldr;
    refs.ldrDetail.textContent = ldr;
    refs.distance.textContent = distance;
    refs.distanceDetail.textContent = distance;
    refs.noise.textContent = noise;
    refs.noiseDetail.textContent = noise;

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
      refs.statusText.textContent = 'เชื่อมต่อไม่ได้';
    } finally {
      if (manual) {
        refs.refreshBtn.disabled = false;
        refs.refreshBtn.textContent = 'รีเฟรชตอนนี้';
      }
    }
  }

  refs.refreshBtn.addEventListener('click', () => fetchStatus(true));
  fetchStatus();
  state.timer = setInterval(fetchStatus, 2000);
})();
