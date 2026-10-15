// Phase one only: three screens, an order-type choice, and a browsable menu.
// These cup photographs are temporary. Replace image paths with real product photos later.
const products = [
  { name: 'Signature Choco', category: 'Non Coffee', prices: [75, 90], image: 'coffee-07.png' },
  { name: 'Strawberry Milk', category: 'Non Coffee', prices: [70, 85], image: 'coffee-01.png' },
  { name: 'Blueberry Milk', category: 'Non Coffee', prices: [70, 85], image: 'coffee-03.png' },
  { name: 'Strawberry Choco', category: 'Non Coffee', prices: [80, 95], image: 'coffee-08.png' },
  { name: 'Oreo Milk', category: 'Non Coffee', prices: [75, 90], image: 'coffee-02.png' },
  { name: 'Double Berry Milk', category: 'Non Coffee', prices: [80, 95], image: 'coffee-03.png' },
  { name: 'Biscoff Milk', category: 'Non Coffee', prices: [80, 95], image: 'coffee-01.png' },
  { name: 'Matcha Creamy', category: 'Matcha', prices: [80, 95], image: 'coffee-06.png' },
  { name: 'Matcha Grassy', category: 'Matcha', prices: [80, 95], image: 'coffee-06.png' },
  { name: 'Strawberry Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'Blueberry Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'Oreo Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'White Mocha Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'Dirty Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'Choco Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'Seasalt Matcha', category: 'Matcha', prices: [90, 105], image: 'coffee-06.png' },
  { name: 'Orange', category: 'Sparkling Soda', prices: [50], image: 'coffee-04.png' },
  { name: 'Green Apple', category: 'Sparkling Soda', prices: [50], image: 'coffee-05.png' },
  { name: 'Strawberry', category: 'Sparkling Soda', prices: [50], image: 'coffee-04.png' },
  { name: 'Blueberry', category: 'Sparkling Soda', prices: [50], image: 'coffee-05.png' },
  { name: 'Lychee', category: 'Sparkling Soda', prices: [50], image: 'coffee-04.png' }
];

let selectedOrderType = null;
let currentScreen = 'welcome';
let currentCategory = 'All';
let isTransitioning = false;
let toastTimeout;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function showScreen(screenId) {
  if (isTransitioning || screenId === currentScreen) return;
  window.clearTimeout(toastTimeout);
  document.getElementById('toast').classList.remove('visible');
  isTransitioning = true;
  const oldScreen = document.getElementById(currentScreen);
  const nextScreen = document.getElementById(screenId);
  // The welcome cups part before revealing the selection, connecting both screens.
  const duration = currentScreen === 'welcome' && !reducedMotion.matches ? 420 : 0;
  oldScreen.classList.add('departing');
  window.setTimeout(() => {
    oldScreen.hidden = true;
    oldScreen.classList.remove('departing');
    nextScreen.hidden = false;
    currentScreen = screenId;
    document.getElementById('header-label').textContent = screenId === 'menu' ? selectedOrderType : '';
    document.querySelector('main').scrollTo({ top: 0, behavior: 'instant' });
    nextScreen.querySelector('h1').focus({ preventScroll: true });
    if (screenId === 'menu') updateCategoryIndicator();
    isTransitioning = false;
  }, duration);
}

function selectOrderType(type) {
  selectedOrderType = type;
  document.querySelectorAll('.order-option').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.order === type));
  });
  document.getElementById('continue').disabled = false;
  // Reveal Continue inside the kiosk without moving keyboard focus off the choice.
  const scroller = document.querySelector('main');
  const action = document.querySelector('.selection-action');
  const revealPosition = scroller.scrollTop + action.getBoundingClientRect().bottom
    - scroller.getBoundingClientRect().bottom + 24;
  scroller.scrollTo({ top: Math.max(0, revealPosition), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}

function continueToMenu() {
  if (!selectedOrderType) return;
  showScreen('menu');
}

function renderProducts(category = 'All') {
  const visibleProducts = products.filter(product => category === 'All' || product.category === category);
  document.getElementById('category-title').innerHTML = `${category === 'All' ? 'All drinks' : category} <span>${visibleProducts.length}</span>`;
  document.getElementById('products').innerHTML = visibleProducts.map((product, index) => `
    <article class="product" style="--i:${Math.min(index, 7)}">
      <div class="product-photo"><img src="assets/${product.image}" alt="" loading="lazy" width="240" height="300"></div>
      <h3>${product.name}</h3>
      <div class="product-details"><span>${product.prices.length === 2 ? '12 oz / 16 oz' : '16 oz'}</span></div>
      <div class="product-bottom"><span class="price">₱${product.prices[0]}${product.prices.length === 2 ? ` <small>/ ₱${product.prices[1]}</small>` : ''}</span><button class="add-preview" aria-label="${product.name}: ordering coming soon" title="Ordering coming soon">+</button></div>
    </article>`).join('');
}

function updateCategoryIndicator() {
  const activeButton = document.querySelector('.category.active');
  const indicator = document.querySelector('.category-indicator');
  indicator.style.width = activeButton.offsetWidth + 'px';
  indicator.style.transform = `translateX(${activeButton.offsetLeft}px)`;
}

function filterProducts(category) {
  if (category === currentCategory) return;
  currentCategory = category;
  document.querySelectorAll('.category').forEach(button => {
    const isActive = button.dataset.category === category;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  updateCategoryIndicator();
  renderProducts(category);
}

document.getElementById('start-order').addEventListener('click', () => showScreen('order-type'));
document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.querySelectorAll('[data-order]').forEach(button => button.addEventListener('click', () => selectOrderType(button.dataset.order)));
document.getElementById('continue').addEventListener('click', continueToMenu);
document.querySelectorAll('.category').forEach(button => button.addEventListener('click', () => filterProducts(button.dataset.category)));
// Preview feedback only: no cart, quantities, checkout, or order is created.
document.getElementById('products').addEventListener('click', event => {
  if (!event.target.closest('.add-preview')) return;
  const toast = document.getElementById('toast');
  toast.textContent = 'Ordering is not available yet.';
  toast.classList.add('visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 3200);
});
window.addEventListener('resize', () => { if (currentScreen === 'menu') updateCategoryIndicator(); });
renderProducts();

// Mouse movement tilts only the drink layers; touch scrolling stays native.
const coffeeStage = document.querySelector('.coffee-stage');
function resetCupTilt() {
  coffeeStage.style.setProperty('--tilt-x', '0deg');
  coffeeStage.style.setProperty('--tilt-y', '0deg');
}
coffeeStage.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
  const bounds = coffeeStage.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
  const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
  coffeeStage.style.setProperty('--tilt-x', `${-y * 6}deg`);
  coffeeStage.style.setProperty('--tilt-y', `${x * 9}deg`);
});
coffeeStage.addEventListener('pointerleave', resetCupTilt);
reducedMotion.addEventListener('change', resetCupTilt);
