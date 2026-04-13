/* ── Navbar scroll ── */
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('nav-scrolled', window.scrollY > 20);
}, { passive: true });

/* ── Mobile menu ── */
const menuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

menuBtn.addEventListener('click', () => {
  const isOpen = !mobileMenu.classList.contains('hidden');
  mobileMenu.classList.toggle('hidden');
  menuBtn.setAttribute('aria-expanded', String(!isOpen));
});

document.querySelectorAll('.mobile-nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    mobileMenu.classList.add('hidden');
    menuBtn.setAttribute('aria-expanded', 'false');
  });
});

/* ── Smooth scroll ── */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    e.preventDefault();
    if (href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = document.querySelector(href);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ── Fade-up on scroll ── */
const fadeObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('[data-animate]').forEach((el) => {
  fadeObserver.observe(el);
});

/* ── GitHub Release API ── */
const REPO = 'azyu/transnovel';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CACHE_KEY = 'transnovel-release';
const CACHE_TTL = 15 * 60 * 1000;

function applyRelease(data) {
  const version = data.tag_name;

  document.querySelectorAll('[data-version]').forEach((el) => {
    el.textContent = version;
  });

  const patterns = {
    'macos-arm64': '.dmg',
    'windows-x64': '_x64-setup.exe',
    'windows-arm64': '_arm64-setup.exe',
  };

  document.querySelectorAll('[data-platform]').forEach((btn) => {
    const suffix = patterns[btn.getAttribute('data-platform')];
    if (!suffix) return;
    const asset = data.assets.find((a) => a.name.endsWith(suffix));
    if (asset) {
      btn.href = asset.browser_download_url;
      btn.classList.remove('loading');
    }
  });
}

async function loadRelease() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) {
        applyRelease(data);
        return;
      }
    }

    const res = await fetch(RELEASE_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    applyRelease(data);
  } catch {
    document.querySelectorAll('[data-platform]').forEach((btn) => {
      btn.href = RELEASES_URL;
      btn.classList.remove('loading');
    });
  }
}

document.addEventListener('DOMContentLoaded', loadRelease);
