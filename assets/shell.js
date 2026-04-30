(function bootstrapPortalShell() {
  window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};

  const moduleButtons = Array.from(document.querySelectorAll('.sidebar-link[data-module-id]'));
  const viewSections = Array.from(document.querySelectorAll('.portal-view[data-module-view]'));
  const loadedModules = new Set();
  const loadingModules = new Map();

  function findButton(moduleId) {
    return moduleButtons.find((button) => button.dataset.moduleId === moduleId) || null;
  }

  function findView(moduleId) {
    return viewSections.find((section) => section.dataset.moduleView === moduleId) || null;
  }

  function loadModuleIfNeeded(button) {
    const moduleId = button.dataset.moduleId;
    const scriptSrc = button.dataset.moduleScript;
    const scriptType = button.dataset.moduleScriptType || 'classic';

    if (!moduleId || !scriptSrc) {
      return Promise.resolve();
    }
    if (loadedModules.has(moduleId)) {
      return Promise.resolve();
    }
    if (loadingModules.has(moduleId)) {
      return loadingModules.get(moduleId);
    }

    const loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.defer = true;
      if (scriptType === 'module') {
        script.type = 'module';
      }
      script.onload = () => {
        loadedModules.add(moduleId);
        loadingModules.delete(moduleId);
        resolve();
      };
      script.onerror = () => {
        loadingModules.delete(moduleId);
        reject(new Error(`Failed to load module script: ${scriptSrc}`));
      };
      document.body.appendChild(script);
    });

    loadingModules.set(moduleId, loadPromise);
    return loadPromise;
  }

  function activateModule(moduleId) {
    const button = findButton(moduleId);
    const view = findView(moduleId);
    if (!button || !view) {
      return;
    }

    moduleButtons.forEach((item) => {
      item.classList.toggle('active', item === button);
    });

    viewSections.forEach((section) => {
      const active = section === view;
      section.hidden = !active;
      section.classList.toggle('active', active);
    });

    loadModuleIfNeeded(button).catch((error) => {
      console.error(error);
    });
  }

  function readInitialModuleId() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('module');
    if (requested && findButton(requested) && findView(requested)) {
      return requested;
    }

    const activeButton = moduleButtons.find((button) => button.classList.contains('active'));
    if (activeButton) {
      return activeButton.dataset.moduleId;
    }

    return moduleButtons[0]?.dataset.moduleId || null;
  }

  moduleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activateModule(button.dataset.moduleId);
    });
  });

  const initialModuleId = readInitialModuleId();
  if (initialModuleId) {
    activateModule(initialModuleId);
  }
})();
