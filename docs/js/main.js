/* ── Navbar scroll ── */
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('nav-scrolled', window.scrollY > 20);
}, { passive: true });

/* ── Smooth scroll ── */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
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

async function loadRelease() {
  const versionEls = document.querySelectorAll('[data-version]');
  const platformBtns = document.querySelectorAll('[data-platform]');

  try {
    const res = await fetch(RELEASE_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const version = data.tag_name;

    versionEls.forEach((el) => {
      el.textContent = version;
    });

    const patterns = {
      'macos-arm64': '.dmg',
      'windows-x64': '_x64-setup.exe',
      'windows-arm64': '_arm64-setup.exe',
    };

    platformBtns.forEach((btn) => {
      const platform = btn.getAttribute('data-platform');
      const suffix = patterns[platform];
      if (!suffix) return;

      const asset = data.assets.find((a) => a.name.endsWith(suffix));
      if (asset) {
        btn.href = asset.browser_download_url;
        btn.classList.remove('loading');
      }
    });
  } catch {
    platformBtns.forEach((btn) => {
      btn.href = RELEASES_URL;
      btn.classList.remove('loading');
    });
  }
}

document.addEventListener('DOMContentLoaded', loadRelease);
