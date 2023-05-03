/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 47525:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(93150);
/* harmony import */ var webextension_polyfill__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__);


// Sign up at https://extensionpay.com to use this library. AGPLv3 licensed.


// For running as a content script. Receive a message from the successful payments page
// and pass it on to the background page to query if the user has paid.
if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
        if (event.origin !== 'https://extensionpay.com') return;
        if (event.source != window) return;
        if (event.data === 'fetch-user' || event.data === 'trial-start') {
            webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.runtime.sendMessage(event.data);
        }
    }, false);
}

function ExtPay(extension_id) {

    const HOST = `https://extensionpay.com`;
    const EXTENSION_URL = `${HOST}/extension/${extension_id}`;

    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async function get(key) {
        try {
            return await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.storage.sync.get(key)
        } catch(e) {
            // if sync not available (like with Firefox temp addons), fall back to local
            return await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.storage.local.get(key)
        }
    }
    async function set(dict) {
        try {
            return await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.storage.sync.set(dict)
        } catch(e) {
            // if sync not available (like with Firefox temp addons), fall back to local
            return await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.storage.local.set(dict)
        }
    }

    // ----- start configuration checks
    webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.management && webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.management.getSelf().then(async (ext_info) => {
        if (!ext_info.permissions.includes('storage')) {
            var permissions = ext_info.hostPermissions.concat(ext_info.permissions);
            throw `ExtPay Setup Error: please include the "storage" permission in manifest.json["permissions"] or else ExtensionPay won't work correctly.

You can copy and paste this to your manifest.json file to fix this error:

"permissions": [
    ${permissions.map(x => `"    ${x}"`).join(',\n')}${permissions.length > 0 ? ',' : ''}
    "storage"
]
`
        }

    });
    // ----- end configuration checks

    // run on "install"
    get(['extensionpay_installed_at', 'extensionpay_user']).then(async (storage) => {
        if (storage.extensionpay_installed_at) return;

        // Migration code: before v2.1 installedAt came from the server
        // so use that stored datetime instead of making a new one.
        const user = storage.extensionpay_user;
        const date = user ? user.installedAt : (new Date()).toISOString();
        await set({'extensionpay_installed_at': date});
    });

    const paid_callbacks = [];
    const trial_callbacks =  [];

    async function create_key() {
        var body = {};
        var ext_info;
        if (webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.management) {
            ext_info = await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.management.getSelf();
        } else if (webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.runtime) {
            ext_info = await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.runtime.sendMessage('extpay-extinfo'); // ask background page for ext info
            if (!ext_info) {
                // Safari doesn't support browser.management for some reason
                const is_dev_mode = !('update_url' in webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.runtime.getManifest());
                ext_info = {installType: is_dev_mode ? 'development' : 'normal'};
            }
        } else {
            throw 'ExtPay needs to be run in a browser extension context'
        }

        if (ext_info.installType == 'development') {
            body.development = true;
        } 

        const resp = await fetch(`${EXTENSION_URL}/api/new-key`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            throw resp.status, `${HOST}/home`
        }
        const api_key = await resp.json();
        await set({extensionpay_api_key: api_key});
        return api_key;
    }

    async function get_key() {
        const storage = await get(['extensionpay_api_key']);
        if (storage.extensionpay_api_key) {
            return storage.extensionpay_api_key;
        }
        return null;
    }

    const datetime_re = /^\d\d\d\d-\d\d-\d\dT/;

    async function fetch_user() {
        var storage = await get(['extensionpay_user', 'extensionpay_installed_at']);
        const api_key = await get_key();
        if (!api_key) {
            return {
                paid: false,
                paidAt: null,
                installedAt: storage.extensionpay_installed_at ? new Date(storage.extensionpay_installed_at) : new Date(), // sometimes this function gets called before the initial install time can be flushed to storage
                trialStartedAt: null,
            }
        }

        const resp = await fetch(`${EXTENSION_URL}/api/user?api_key=${api_key}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });
        // TODO: think harder about error states and what users will want (bad connection, server error, id not found)
        if (!resp.ok) throw 'ExtPay error while fetching user: '+(await resp.text())

        const user_data = await resp.json();

        const parsed_user = {};
        for (var [key, value] of Object.entries(user_data)) {
            if (value && value.match && value.match(datetime_re)) {
                value = new Date(value);
            }
            parsed_user[key] = value;
        }
        parsed_user.installedAt = new Date(storage.extensionpay_installed_at);
          

        if (parsed_user.paidAt) {
            if (!storage.extensionpay_user || (storage.extensionpay_user && !storage.extensionpay_user.paidAt)) {
                paid_callbacks.forEach(cb => cb(parsed_user));
            }
        }
        if (parsed_user.trialStartedAt) {
            if (!storage.extensionpay_user || (storage.extensionpay_user && !storage.extensionpay_user.trialStartedAt)) {
                trial_callbacks.forEach(cb => cb(parsed_user));
            }

        }
        await set({extensionpay_user: user_data});

        return parsed_user;
    }

    async function payment_page_link() {
        var api_key = await get_key();
        if (!api_key) {
            api_key = await create_key();
        }
        return `${EXTENSION_URL}?api_key=${api_key}`
    }

    async function open_popup(url, width, height) {
        if (webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.windows && webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.windows.create) {
            const current_window = await webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.windows.getCurrent();
            // https://stackoverflow.com/a/68456858
            const left = Math.round((current_window.width - width) * 0.5 + current_window.left);
            const top = Math.round((current_window.height - height) * 0.5 + current_window.top);
            try {
                webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.windows.create({
                    url: url,
                    type: "popup",
                    focused: true,
                    width,
                    height,
                    left,
                    top
                });
            } catch(e) {
                // firefox doesn't support 'focused'
                webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.windows.create({
                    url: url,
                    type: "popup",
                    width,
                    height,
                    left,
                    top
                });
            }
        } else {
            // for opening from a content script
            // https://developer.mozilla.org/en-US/docs/Web/API/Window/open
            window.open(url, null, `toolbar=no,location=no,directories=no,status=no,menubar=no,width=${width},height=${height},left=450`);
        }
    }

    async function open_payment_page() {
        const url = await payment_page_link();
        open_popup(url, 500, 800);
    }

    async function open_trial_page(period) {
        // let user have period string like '1 week' e.g. "start your 1 week free trial"

        var api_key = await get_key();
        if (!api_key) {
            api_key = await create_key();
        }
        var url = `${EXTENSION_URL}/trial?api_key=${api_key}`;
        if (period) {
            url += `&period=${period}`;
        }
        open_popup(url, 500, 650);
    }
    async function open_login_page() {
        var api_key = await get_key();
        if (!api_key) {
            api_key = await create_key();
        }
        const url = `${EXTENSION_URL}/reactivate?api_key=${api_key}`;
        open_popup(url, 500, 800);
    }

    var polling = false;
    async function poll_user_paid() {
        // keep trying to fetch user in case stripe webhook is late
        if (polling) return;
        polling = true;
        var user = await fetch_user();
        for (var i=0; i < 2*60; ++i) {
            if (user.paidAt) {
                polling = false;
                return user;
            }
            await timeout(1000);
            user = await fetch_user();
        }
        polling = false;
    }


    
    return {
        getUser: function() {
            return fetch_user()
        },
        onPaid: {
            addListener: function(callback) {
                const content_script_template = `"content_scripts": [
                {
            "matches": ["${HOST}/*"],
            "js": ["ExtPay.js"],
            "run_at": "document_start"
        }]`;
                const manifest = webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.runtime.getManifest();
                if (!manifest.content_scripts) {
                    throw `ExtPay setup error: To use the onPaid callback handler, please include ExtPay as a content script in your manifest.json. You can copy the example below into your manifest.json or check the docs: https://github.com/Glench/ExtPay#2-configure-your-manifestjson

        ${content_script_template}`
                }
                const extpay_content_script_entry = manifest.content_scripts.find(obj => {
                    // removing port number because firefox ignores content scripts with port number
                    return obj.matches.includes(HOST.replace(':3000', '')+'/*')
                });
                if (!extpay_content_script_entry) {
                    throw `ExtPay setup error: To use the onPaid callback handler, please include ExtPay as a content script in your manifest.json matching "${HOST}/*". You can copy the example below into your manifest.json or check the docs: https://github.com/Glench/ExtPay#2-configure-your-manifestjson

        ${content_script_template}`
                } else {
                    if (!extpay_content_script_entry.run_at || extpay_content_script_entry.run_at !== 'document_start') {
                        throw `ExtPay setup error: To use the onPaid callback handler, please make sure the ExtPay content script in your manifest.json runs at document start. You can copy the example below into your manifest.json or check the docs: https://github.com/Glench/ExtPay#2-configure-your-manifestjson

        ${content_script_template}`
                    }
                }

                paid_callbacks.push(callback);
            },
            // removeListener: function(callback) {
            //     // TODO
            // }
        },
        openPaymentPage: open_payment_page,
        openTrialPage: open_trial_page,
        openLoginPage: open_login_page,
        onTrialStarted: {
            addListener: function(callback) {
                trial_callbacks.push(callback);
            }
        },
        startBackground: function() {
            webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.runtime.onMessage.addListener(function(message, sender, send_response) {
                console.log('service worker got message! Here it is:', message);
                if (message == 'fetch-user') {
                    // Only called via extensionpay.com/extension/[extension-id]/paid -> content_script when user successfully pays.
                    // It's possible attackers could trigger this but that is basically harmless. It would just query the user.
                    poll_user_paid();
                } else if (message == 'trial-start') {
                    // no need to poll since the trial confirmation page has already set trialStartedAt
                    fetch_user(); 
                } else if (message == 'extpay-extinfo' && webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.management) {
                    // get this message from content scripts which can't access browser.management
                    return webextension_polyfill__WEBPACK_IMPORTED_MODULE_0__.management.getSelf()
                } 
            });
        }
    }
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ExtPay);


/***/ }),

/***/ 98136:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const chromeStoredData_1 = __webpack_require__(8555);
const actionButtonUtils_1 = __webpack_require__(37059);
const ga_1 = __webpack_require__(32458);
const generalUtils_1 = __webpack_require__(65040);
const messageUtils_1 = __webpack_require__(5879);
const gamepadConfig_1 = __webpack_require__(4053);
const messages_1 = __webpack_require__(28724);
const payments_1 = __webpack_require__(72133);
const trial_1 = __webpack_require__(42748);
const extpay = (0, payments_1.getExtPay)();
extpay.startBackground();
let cachedPayment = null;
function getPaymentIfNeeded() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!cachedPayment || (!cachedPayment.paid && (0, trial_1.computeTrialState)(cachedPayment.trialStartedAt).status !== 'active')) {
            // refresh payment data if user isn't in an active state
            cachedPayment = yield (0, payments_1.getPayment)();
        }
        return cachedPayment;
    });
}
/*
 * This script is run as a service worker and may be killed or restarted at any time.
 * Make sure to read the following for more information:
 * https://developer.chrome.com/docs/extensions/mv3/migrating_to_service_workers/
 */
chrome.runtime.onInstalled.addListener(({ reason }) => {
    // Page actions are disabled by default and enabled on select tabs
    if (reason === 'install') {
        // First time install - enable the default gamepad config
        (0, chromeStoredData_1.storeActiveGamepadConfig)(gamepadConfig_1.DEFAULT_CONFIG_NAME);
    }
    if (typeof chrome.runtime.setUninstallURL === 'function') {
        chrome.runtime.setUninstallURL('https://forms.gle/nzToDcw1mmssMBLx6');
    }
});
// https://developer.chrome.com/docs/extensions/reference/commands/#handling-command-events
chrome.commands.onCommand.addListener((command) => {
    console.log('Keyboard command:', command);
    (0, ga_1.postGa)('keyboard_command', { command });
    const commandToProfileOrder = {
        'profile-prev': true,
        'profile-next': false,
    };
    const paymentPromise = getPaymentIfNeeded();
    (0, chromeStoredData_1.getAllStoredSync)().then(({ activeConfig, isEnabled, configs, prefs }) => {
        const isPrev = commandToProfileOrder[command];
        if (command === 'show-hide-cheatsheet') {
            const newPrefs = Object.assign(Object.assign({}, prefs), { showControlsOverlay: !prefs.showControlsOverlay });
            (0, messageUtils_1.sendMessage)((0, messages_1.updatePrefsMsg)(newPrefs));
            (0, chromeStoredData_1.storeGlobalPrefs)(newPrefs);
        }
        else {
            paymentPromise.then((payment) => {
                // Make sure user is allowed to activate a config
                if (payment.paid || (0, trial_1.computeTrialState)(payment.trialStartedAt).status === 'active') {
                    if (isPrev !== undefined) {
                        // select next/prev config
                        const configsArray = Object.keys(configs);
                        const currentConfigIndex = configsArray.indexOf(activeConfig);
                        const nextConfigName = currentConfigIndex === -1
                            ? gamepadConfig_1.DEFAULT_CONFIG_NAME
                            : (0, generalUtils_1.arrayPrevOrNext)(configsArray, currentConfigIndex, isPrev);
                        const nextConfig = configs[nextConfigName];
                        (0, messageUtils_1.setActiveConfig)(nextConfigName, nextConfig);
                    }
                    else if (command === 'toggle-on-off') {
                        // toggle config on/off
                        if (isEnabled) {
                            (0, messageUtils_1.disableActiveConfig)();
                        }
                        else if (activeConfig) {
                            (0, messageUtils_1.setActiveConfig)(activeConfig, configs[activeConfig]);
                        }
                    }
                }
            });
        }
        // Close the popup if it is open to avoid it showing stale data
        chrome.runtime.sendMessage((0, messages_1.closeWindowMsg)());
    });
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Receives messages from the content_script
    if (!sender.tab)
        return false;
    if (msg.type === messages_1.MessageTypes.INJECTED) {
        console.log('Injected');
        (0, chromeStoredData_1.getAllStoredSync)().then(({ seenOnboarding }) => {
            sendResponse((0, messages_1.seenOnboardingMsg)(seenOnboarding));
        });
        // Note this is probably not needed anymore, since action button should always be enabled now
        (0, actionButtonUtils_1.enableActionButton)(sender.tab.id);
        return true;
    }
    if (msg.type === messages_1.MessageTypes.INITIALIZED) {
        console.log('Initialized', msg.gameName);
        (0, chromeStoredData_1.updateGameName)(msg.gameName);
        // Send any currently-active config
        Promise.all([(0, chromeStoredData_1.getAllStoredSync)(), getPaymentIfNeeded()]).then(([stored, user]) => {
            const { isEnabled, activeConfig, configs, seenOnboarding, prefs } = stored;
            const isAllowed = user.paid || (0, trial_1.computeTrialState)(user.trialStartedAt).status === 'active';
            const disabled = !isEnabled || !isAllowed;
            const configName = disabled ? null : activeConfig;
            const config = disabled ? null : configs[activeConfig];
            (0, ga_1.postGa)('initialize', { paid: String(user.paid), seenOnboarding: String(seenOnboarding) });
            if (msg.gameName) {
                (0, ga_1.postGa)('play', { gameName: msg.gameName });
            }
            sendResponse((0, messages_1.initializeResponseMsg)(configName, config, seenOnboarding, prefs));
        });
        // https://stackoverflow.com/a/56483156
        return true;
    }
    if (msg.type === messages_1.MessageTypes.GAME_CHANGED) {
        console.log('Game changed to', msg.gameName);
        if (msg.gameName) {
            (0, ga_1.postGa)('play', { gameName: msg.gameName });
        }
        (0, chromeStoredData_1.updateGameName)(msg.gameName);
        return false;
    }
    if (msg.type === messages_1.MessageTypes.SEEN_ONBOARDING) {
        console.log('User dismissed onboarding');
        (0, ga_1.postGa)('dismiss', { modal: 'onboarding' });
        (0, chromeStoredData_1.storeSeenOnboarding)();
        getPaymentIfNeeded().then((payment) => {
            // Automatically open trial popup if user hasn't paid and isn't already in a trial
            const trialState = (0, trial_1.computeTrialState)(payment.trialStartedAt);
            if (!payment.paid && trialState.status === 'inactive') {
                extpay.openTrialPage(`${trial_1.trialDays} day`);
            }
        });
        return false;
    }
    return false;
});


/***/ }),

/***/ 8555:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAllStoredSync = exports.getSession = exports.getClientId = exports.storeSession = exports.storeClientId = exports.storeActiveGamepadConfig = exports.storeGlobalPrefs = exports.storeGamepadConfigEnabled = exports.deleteGamepadConfig = exports.storeGamepadConfig = exports.storeSeenOnboarding = exports.getLocalGameStatus = exports.updateGameName = void 0;
const gamepadConfig_1 = __webpack_require__(4053);
const defaults_1 = __webpack_require__(53201);
// Chrome Sync Storage Limits:
// max items = 512
// max writes per second = 2
// max bytes per item = 8.192 KB
var LocalStorageKeys;
(function (LocalStorageKeys) {
    LocalStorageKeys["GAME_NAME"] = "GAME_NAME";
    LocalStorageKeys["SESSION"] = "SESSION";
})(LocalStorageKeys || (LocalStorageKeys = {}));
var SyncStorageKeys;
(function (SyncStorageKeys) {
    SyncStorageKeys["CID"] = "CID";
    SyncStorageKeys["GAMEPAD_CONFIGS"] = "GP_CONF";
    SyncStorageKeys["ACTIVE_GAMEPAD_CONFIG"] = "ACTIVE_GP_CONF";
    SyncStorageKeys["ENABLED"] = "ENABLED";
    SyncStorageKeys["PAYMENT"] = "PAYMENT";
    SyncStorageKeys["ONBOARDED"] = "ONBOARDED";
    SyncStorageKeys["GLOBAL_PREFS"] = "PREFS";
})(SyncStorageKeys || (SyncStorageKeys = {}));
function syncStorageSet(items) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield chrome.storage.sync.set(items);
        }
        catch (e) {
            yield chrome.storage.local.set(items);
        }
    });
}
function syncStorageGet(keys) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield chrome.storage.sync.get(keys);
        }
        catch (e) {
            return yield chrome.storage.local.get(keys);
        }
    });
}
function syncStorageRemove(keys) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield chrome.storage.sync.remove(keys);
        }
        catch (e) {
            return yield chrome.storage.local.remove(keys);
        }
    });
}
function updateGameName(gameName) {
    return chrome.storage.local.set({ [LocalStorageKeys.GAME_NAME]: gameName });
}
exports.updateGameName = updateGameName;
function getLocalGameStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield chrome.storage.local.get(LocalStorageKeys.GAME_NAME);
        return (data && data[LocalStorageKeys.GAME_NAME]) || null;
    });
}
exports.getLocalGameStatus = getLocalGameStatus;
/**
 * Sets "seen onboarding" to true.
 */
function storeSeenOnboarding() {
    return syncStorageSet({ [SyncStorageKeys.ONBOARDED]: true });
}
exports.storeSeenOnboarding = storeSeenOnboarding;
/**
 * Updates a stored gamepad config by name (does not set it as active)
 */
function storeGamepadConfig(name, gamepadConfig) {
    return syncStorageSet({ [`${SyncStorageKeys.GAMEPAD_CONFIGS}:${name}`]: gamepadConfig });
}
exports.storeGamepadConfig = storeGamepadConfig;
/**
 * Deletes a stored gamepad config.
 * Be careful not to delete the active config!
 */
function deleteGamepadConfig(name) {
    if (name === gamepadConfig_1.DEFAULT_CONFIG_NAME) {
        throw new Error('Cannot delete default config');
    }
    return syncStorageRemove(`${SyncStorageKeys.GAMEPAD_CONFIGS}:${name}`);
}
exports.deleteGamepadConfig = deleteGamepadConfig;
/**
 * Sets the extension enabled/disabled.
 */
function storeGamepadConfigEnabled(enabled) {
    return syncStorageSet({ [SyncStorageKeys.ENABLED]: enabled });
}
exports.storeGamepadConfigEnabled = storeGamepadConfigEnabled;
/**
 * Updates global preferences.
 */
function storeGlobalPrefs(prefs) {
    return syncStorageSet({ [SyncStorageKeys.GLOBAL_PREFS]: prefs });
}
exports.storeGlobalPrefs = storeGlobalPrefs;
/**
 * Sets a gamepad config as active.
 */
function storeActiveGamepadConfig(name) {
    // TODO validate the name exists before setting it active?
    return syncStorageSet({
        [SyncStorageKeys.ENABLED]: true,
        [SyncStorageKeys.ACTIVE_GAMEPAD_CONFIG]: name,
    });
}
exports.storeActiveGamepadConfig = storeActiveGamepadConfig;
/**
 * Stores a new client ID to sync storage.
 */
function storeClientId(clientId) {
    return syncStorageSet({ [SyncStorageKeys.CID]: clientId });
}
exports.storeClientId = storeClientId;
/**
 * Stores a new session to local storage.
 */
function storeSession(session) {
    return chrome.storage.local.set({ [LocalStorageKeys.SESSION]: session });
}
exports.storeSession = storeSession;
/**
 * Gets client ID from sync storage.
 */
function getClientId() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield syncStorageGet(SyncStorageKeys.CID);
        return (data && data[SyncStorageKeys.CID]) || null;
    });
}
exports.getClientId = getClientId;
/**
 * Gets session from local storage.
 */
function getSession() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield chrome.storage.local.get(LocalStorageKeys.SESSION);
        return (data && data[LocalStorageKeys.SESSION]) || null;
    });
}
exports.getSession = getSession;
function normalizeGamepadConfigs(data = {}) {
    const cid = data[SyncStorageKeys.CID];
    const activeConfig = data[SyncStorageKeys.ACTIVE_GAMEPAD_CONFIG] || gamepadConfig_1.DEFAULT_CONFIG_NAME;
    const payment = data[SyncStorageKeys.PAYMENT];
    const prefs = data[SyncStorageKeys.GLOBAL_PREFS] || defaults_1.defaultPrefs;
    const isEnabled = data[SyncStorageKeys.ENABLED] === undefined
        ? !!data[SyncStorageKeys.ACTIVE_GAMEPAD_CONFIG]
        : data[SyncStorageKeys.ENABLED];
    const allKeys = Object.keys(data);
    const configKeys = allKeys.filter((key) => key.startsWith(SyncStorageKeys.GAMEPAD_CONFIGS));
    const seenOnboarding = data[SyncStorageKeys.ONBOARDED] || configKeys.length > 1 || activeConfig !== gamepadConfig_1.DEFAULT_CONFIG_NAME;
    const initialConfigsMap = {
        [gamepadConfig_1.DEFAULT_CONFIG_NAME]: gamepadConfig_1.defaultGamepadConfig,
    };
    return {
        cid,
        isEnabled,
        activeConfig,
        seenOnboarding,
        payment,
        prefs,
        configs: configKeys.reduce((configs, key) => {
            const name = key.split(':')[1];
            const config = data[key];
            (0, gamepadConfig_1.upgradeOldGamepadConfig)(config);
            configs[name] = config;
            return configs;
        }, initialConfigsMap),
    };
}
function getAllStoredSync() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield syncStorageGet(null);
        return normalizeGamepadConfigs(data);
    });
}
exports.getAllStoredSync = getAllStoredSync;


/***/ }),

/***/ 37059:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Wrapped to support both manifest v2 and v3
// https://developer.chrome.com/docs/extensions/mv3/intro/mv3-migration/#action-api-unification
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.enableActionButton = exports.disableActionButton = void 0;
function disableActionButton() {
    if (chrome.action !== undefined) {
        return chrome.action.disable();
    }
    else {
        return chrome.browserAction.disable();
    }
}
exports.disableActionButton = disableActionButton;
function enableActionButton(tabId) {
    if (chrome.action !== undefined) {
        return chrome.action.enable(tabId);
    }
    else {
        return chrome.browserAction.enable(tabId);
    }
}
exports.enableActionButton = enableActionButton;


/***/ }),

/***/ 32458:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/* eslint-disable max-len */
// Uses GA "Measurement Protocol" API since we can't use traditional gtag.js due to MV3 service worker
// https://stackoverflow.com/a/73825802
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.postGa = exports.getClientIdAndSession = void 0;
const uuid_1 = __webpack_require__(67429);
const chromeStoredData_1 = __webpack_require__(8555);
// Note: This api does not give response codes if something is wrong
const debug = false;
const rootUrl = `https://www.google-analytics.com/${debug ? 'debug/' : ''}mp/collect`;
const extUrl = 'https://davididol.com/xcloud-keyboard-mouse/EXT';
// https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#required_parameters
const GA_API_TOKEN = "w30DzBnFR6y7CE6iHTGvBg";
const GA_MEASUREMENT_ID = 'G-DKKYLRVJYT';
let cachedClientId = null;
let cachedSession = null;
function getClientIdAndSession() {
    return __awaiter(this, void 0, void 0, function* () {
        const [maybeClientId, maybeSession] = yield Promise.all([
            cachedClientId || (0, chromeStoredData_1.getClientId)(),
            cachedSession || (0, chromeStoredData_1.getSession)(),
        ]);
        const savePromises = [];
        if (!maybeClientId) {
            cachedClientId = (0, uuid_1.v4)();
            savePromises.push((0, chromeStoredData_1.storeClientId)(cachedClientId));
        }
        else {
            cachedClientId = maybeClientId;
        }
        // By default, a session ends (times out) after 30 minutes of user inactivity.
        const sessionExpirationMs = 30 * 60 * 1000;
        const now = new Date().getTime();
        if (!maybeSession || now - maybeSession.startMs > sessionExpirationMs) {
            cachedSession = { sessionId: (0, uuid_1.v4)(), startMs: now };
            savePromises.push((0, chromeStoredData_1.storeSession)(cachedSession));
        }
        else {
            cachedSession = maybeSession;
        }
        yield Promise.all(savePromises);
        return { clientId: cachedClientId, session: cachedSession };
    });
}
exports.getClientIdAndSession = getClientIdAndSession;
// Fire-and-forget function to send an event to GA from anywhere in the extension
// TODO add queue so we can ensure proper sequencing without needing to await at the top level - avoids blocking UI
function postGa(eventName, inputParams = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!GA_API_TOKEN) {
            console.error('Missing GA API token');
            return;
        }
        const { clientId, session } = yield getClientIdAndSession();
        if (!cachedClientId) {
            console.error(`Ignoring GA event "${eventName}" due to missing cid`);
            return;
        }
        // Extend with session information in order to show up in Realtime
        // https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#recommended_parameters_for_reports
        let params = Object.assign(Object.assign({}, inputParams), { 
            // https://support.google.com/analytics/answer/11109416
            engagement_time_msec: String(new Date().getTime() - session.startMs), 
            // https://support.google.com/analytics/answer/9191807
            session_id: session.sessionId.toString() });
        if (eventName === 'page_view') {
            params = Object.assign(Object.assign({}, params), { page_location: extUrl + params.page_location });
        }
        console.log('GA:', eventName, params);
        try {
            // update session timestamp (no await)
            (0, chromeStoredData_1.storeSession)(Object.assign(Object.assign({}, session), { startMs: new Date().getTime() }));
            // send request
            yield fetch(`${rootUrl}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_TOKEN}`, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify({
                    client_id: clientId,
                    events: [{ name: eventName, params }],
                }),
            });
        }
        catch (e) {
            console.error('GA failed to send');
        }
    });
}
exports.postGa = postGa;


/***/ }),

/***/ 65040:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.arrayPrevOrNext = void 0;
function arrayPrevOrNext(array, currentIndex, isPrev) {
    const n = array.length;
    if (n === 0) {
        throw new Error('Array must not be empty');
    }
    if (n === 1) {
        return array[currentIndex];
    }
    const i = currentIndex + (isPrev ? -1 : 1);
    return array[((i % n) + n) % n];
}
exports.arrayPrevOrNext = arrayPrevOrNext;


/***/ }),

/***/ 5879:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.disableActiveConfig = exports.setActiveConfig = exports.sendMessage = void 0;
const messages_1 = __webpack_require__(28724);
const chromeStoredData_1 = __webpack_require__(8555);
const tabsUtils_1 = __webpack_require__(32550);
function sendMessage(msg) {
    return __awaiter(this, void 0, void 0, function* () {
        const tabs = yield (0, tabsUtils_1.getAllTabs)();
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, msg, () => {
                // Ignore errors here since we blast message to all tabs, some of which may not have listeners
                // https://groups.google.com/a/chromium.org/g/chromium-extensions/c/Y5pYf1iv2k4?pli=1
                // eslint-disable-next-line no-unused-expressions
                chrome.runtime.lastError;
            });
        });
    });
}
exports.sendMessage = sendMessage;
function setActiveConfig(name, gamepadConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        yield sendMessage((0, messages_1.activateGamepadConfigMsg)(name, gamepadConfig));
        yield (0, chromeStoredData_1.storeActiveGamepadConfig)(name);
        return { name, gamepadConfig };
    });
}
exports.setActiveConfig = setActiveConfig;
function disableActiveConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        yield sendMessage((0, messages_1.disableGamepadMsg)());
        yield (0, chromeStoredData_1.storeGamepadConfigEnabled)(false);
    });
}
exports.disableActiveConfig = disableActiveConfig;


/***/ }),

/***/ 32550:
/***/ (function(__unused_webpack_module, exports) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAllTabs = exports.getActiveTab = void 0;
function getActiveTab() {
    return __awaiter(this, void 0, void 0, function* () {
        const tabs = yield chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
    });
}
exports.getActiveTab = getActiveTab;
function getAllTabs() {
    return __awaiter(this, void 0, void 0, function* () {
        const tabs = yield chrome.tabs.query({ status: 'complete' });
        return tabs;
    });
}
exports.getAllTabs = getAllTabs;


/***/ }),

/***/ 53201:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultPrefs = void 0;
exports.defaultPrefs = { showControlsOverlay: false };


/***/ }),

/***/ 43842:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.camelToSpace = void 0;
function camelToSpace(str) {
    const cleanedUp = str.replace(/([a-z|0-9])([A-Z])/g, '$1 $2');
    return cleanedUp.charAt(0).toUpperCase() + cleanedUp.slice(1);
}
exports.camelToSpace = camelToSpace;


/***/ }),

/***/ 4053:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.emptyGamepadConfig = exports.defaultGamepadConfig = exports.isGamepadConfigValid = exports.validateMouseConfig = exports.processGamepadConfig = exports.upgradeOldGamepadConfig = exports.isButtonMapping = exports.MAX_BINDINGS_PER_BUTTON = exports.DEFAULT_SENSITIVITY = exports.MAX_NUM_CONFIGS = exports.DEFAULT_CONFIG_NAME = void 0;
const formattingUtils_1 = __webpack_require__(43842);
exports.DEFAULT_CONFIG_NAME = 'default';
exports.MAX_NUM_CONFIGS = 25;
exports.DEFAULT_SENSITIVITY = 10;
exports.MAX_BINDINGS_PER_BUTTON = 2; // TODO do people want/need tripple keybinds?
const buttonToGamepadIndex = {
    a: 0,
    b: 1,
    x: 2,
    y: 3,
    leftShoulder: 4,
    rightShoulder: 5,
    leftTrigger: 6,
    rightTrigger: 7,
    select: 8,
    start: 9,
    leftStickPressed: 10,
    rightStickPressed: 11,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
    home: 16,
};
const buttonToAxisIndex = (button) => {
    return button[0] === 'l' ? 0 : 1;
};
const buttonToAxisDirection = (button) => {
    return button.replace(/^(left|right)Stick/, '')[0].toLowerCase();
};
const isButtonMapping = (mapping) => {
    return mapping.gamepadIndex !== undefined;
};
exports.isButtonMapping = isButtonMapping;
// Modifies a gamepad config in-place to convert old schemas
function upgradeOldGamepadConfig(config) {
    const { keyConfig } = config;
    Object.keys(keyConfig).forEach((button) => {
        const keyMap = keyConfig[button];
        if (!keyMap) {
            return;
        }
        const codes = (!Array.isArray(keyMap) ? [keyMap] : keyMap).flatMap((code) => {
            // Expand any special code into a group of codes (e.g. 'Scroll' -> ['ScrollUp', 'ScrollDown'])
            if (code === 'Scroll') {
                return ['ScrollUp', 'ScrollDown'];
            }
            return code;
        });
        keyConfig[button] = codes;
    });
}
exports.upgradeOldGamepadConfig = upgradeOldGamepadConfig;
function processGamepadConfig(config) {
    // Validate a given code has only one button
    // and normalize from code to buttons array
    const codeMapping = {};
    const invalidButtons = {};
    Object.keys(config).forEach((button) => {
        const keyMap = config[button];
        if (!keyMap) {
            return;
        }
        const codes = !Array.isArray(keyMap) ? [keyMap] : keyMap;
        // Technically we allow importing configs with more than MAX_BINDINGS_PER_BUTTON, but it is not possible
        // in the UI. We could validate it here if we want to be more strict.
        // if (codes.length > MAX_BINDINGS_PER_BUTTON) {
        //   invalidButtons[button] = `Only ${MAX_BINDINGS_PER_BUTTON} bindings per button is allowed`;
        //   return;
        // }
        for (const code of codes) {
            if (code === 'Escape') {
                invalidButtons[button] = 'Binding Escape key is not allowed';
                continue;
            }
            if (codeMapping[code]) {
                invalidButtons[button] = `'${code}' is already bound to button '${(0, formattingUtils_1.camelToSpace)(codeMapping[code].button)}'`;
                continue;
            }
            const gamepadIndex = buttonToGamepadIndex[button];
            if (gamepadIndex !== undefined) {
                codeMapping[code] = { button, gamepadIndex };
            }
            else {
                const axisIndex = buttonToAxisIndex(button);
                const axisDirection = buttonToAxisDirection(button);
                codeMapping[code] = { button, axisIndex, axisDirection };
            }
        }
    });
    return { codeMapping, invalidButtons, hasErrors: Object.keys(invalidButtons).length > 0 };
}
exports.processGamepadConfig = processGamepadConfig;
function validateMouseConfig(mouseConfig) {
    const { sensitivity, mouseControls } = mouseConfig;
    const errors = {};
    if (mouseControls !== undefined && mouseControls !== 0 && mouseControls !== 1) {
        errors.mouseControls = 'Invalid stick number';
    }
    if (sensitivity < 1 || sensitivity > 1000) {
        errors.mouseControls = 'Invalid sensitivity value. Must be between 1 and 1000.';
    }
    return { errors, hasErrors: Object.keys(errors).length > 0 };
}
exports.validateMouseConfig = validateMouseConfig;
function isGamepadConfigValid(gamepadConfig) {
    try {
        const { hasErrors: mouseErrors } = validateMouseConfig(gamepadConfig.mouseConfig);
        if (mouseErrors) {
            return false;
        }
        const { hasErrors: buttonErrors } = processGamepadConfig(gamepadConfig.keyConfig);
        return !buttonErrors;
    }
    catch (e) {
        return false;
    }
}
exports.isGamepadConfigValid = isGamepadConfigValid;
exports.defaultGamepadConfig = {
    mouseConfig: {
        mouseControls: 1,
        sensitivity: exports.DEFAULT_SENSITIVITY,
    },
    // Find "event.code" from https://keycode.info/
    keyConfig: {
        a: 'Space',
        b: ['ControlLeft', 'Backspace'],
        x: 'KeyR',
        y: ['ScrollUp', 'ScrollDown'],
        leftShoulder: ['KeyC', 'KeyG'],
        leftTrigger: 'RightClick',
        rightShoulder: 'KeyQ',
        rightTrigger: 'Click',
        start: 'Enter',
        select: 'Tab',
        home: undefined,
        dpadUp: ['ArrowUp', 'KeyX'],
        dpadLeft: ['ArrowLeft', 'KeyN'],
        dpadDown: ['ArrowDown', 'KeyZ'],
        dpadRight: 'ArrowRight',
        leftStickUp: 'KeyW',
        leftStickLeft: 'KeyA',
        leftStickDown: 'KeyS',
        leftStickRight: 'KeyD',
        rightStickUp: 'KeyO',
        rightStickLeft: 'KeyK',
        rightStickDown: 'KeyL',
        rightStickRight: 'Semicolon',
        leftStickPressed: 'ShiftLeft',
        rightStickPressed: 'KeyF',
    },
};
exports.emptyGamepadConfig = {
    mouseConfig: {
        mouseControls: undefined,
        sensitivity: exports.DEFAULT_SENSITIVITY,
    },
    keyConfig: Object.keys(exports.defaultGamepadConfig.keyConfig).reduce((keyConfig, key) => {
        keyConfig[key] = undefined;
        return keyConfig;
    }, {}),
};


/***/ }),

/***/ 28724:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.closeWindowMsg = exports.updatePrefsMsg = exports.disableGamepadMsg = exports.activateGamepadConfigMsg = exports.initializeResponseMsg = exports.seenOnboardingMsg = exports.gameChangedMsg = exports.intializedMsg = exports.injectedMsg = exports.MessageTypes = void 0;
var MessageTypes;
(function (MessageTypes) {
    MessageTypes["INJECTED"] = "INJECTED";
    MessageTypes["INITIALIZED"] = "INITIALIZED";
    MessageTypes["GAME_CHANGED"] = "GAME_CHANGED";
    MessageTypes["ACTIVATE_GAMEPAD_CONFIG"] = "ACTIVATE_GAMEPAD_CONFIG";
    MessageTypes["INITIALIZE_RESPONSE"] = "INITIALIZE_RESPONSE";
    MessageTypes["SEEN_ONBOARDING"] = "SEEN_ONBOARDING";
    MessageTypes["UPDATE_PREFS"] = "UPDATE_PREFS";
    MessageTypes["CLOSE_WINDOW"] = "CLOSE_WINDOW";
})(MessageTypes = exports.MessageTypes || (exports.MessageTypes = {}));
// Sent from page to background to enable the context button in the toolbar
function injectedMsg() {
    return { type: MessageTypes.INJECTED };
}
exports.injectedMsg = injectedMsg;
// Sent from page to background to load all settings
function intializedMsg(gameName) {
    return { type: MessageTypes.INITIALIZED, gameName };
}
exports.intializedMsg = intializedMsg;
// Sent from page to background to set game name manually
function gameChangedMsg(gameName) {
    return { type: MessageTypes.GAME_CHANGED, gameName };
}
exports.gameChangedMsg = gameChangedMsg;
// Sent from the page to background to note the user has seen the onboarding
function seenOnboardingMsg(seen = true) {
    return { type: MessageTypes.SEEN_ONBOARDING, seen };
}
exports.seenOnboardingMsg = seenOnboardingMsg;
// Sent from background to page for user's first time using the extension
function initializeResponseMsg(name, gamepadConfig, seenOnboarding, prefs) {
    return { type: MessageTypes.INITIALIZE_RESPONSE, name, gamepadConfig, seenOnboarding, prefs };
}
exports.initializeResponseMsg = initializeResponseMsg;
// Sent from background to page to set active mouse+keyboard config (null for disabled)
function activateGamepadConfigMsg(name, gamepadConfig) {
    return { type: MessageTypes.ACTIVATE_GAMEPAD_CONFIG, name, gamepadConfig };
}
exports.activateGamepadConfigMsg = activateGamepadConfigMsg;
function disableGamepadMsg() {
    return activateGamepadConfigMsg(null, null);
}
exports.disableGamepadMsg = disableGamepadMsg;
// Sent from the background to page when preferences are updated that would impact it
function updatePrefsMsg(prefs) {
    return { type: MessageTypes.UPDATE_PREFS, prefs };
}
exports.updatePrefsMsg = updatePrefsMsg;
// Sent from the background to popup to close
function closeWindowMsg() {
    return { type: MessageTypes.CLOSE_WINDOW };
}
exports.closeWindowMsg = closeWindowMsg;


/***/ }),

/***/ 72133:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.notPaidPayment = exports.getPayment = exports.getExtPay = void 0;
const extpay_1 = __importDefault(__webpack_require__(47525));
const ga_1 = __webpack_require__(32458);
function getExtPay() {
    return (0, extpay_1.default)('keyboard-and-mouse-for-xbox-xcloud');
}
exports.getExtPay = getExtPay;
function getPayment() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield getExtPay().getUser();
        }
        catch (error) {
            (0, ga_1.postGa)('exception', {
                description: 'extpay.getUser failure' + (error ? `: ${error.message}` : ''),
                fatal: true,
            });
            throw error;
        }
    });
}
exports.getPayment = getPayment;
exports.notPaidPayment = {
    paid: false,
    paidAt: null,
    installedAt: new Date().getTime(),
    trialStartedAt: null,
};


/***/ }),

/***/ 42748:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.computeTrialState = exports.trialDays = void 0;
exports.trialDays = 3;
const computeTrialState = (trialStartedAt) => {
    if (trialStartedAt === null) {
        return { status: 'inactive', remainingDays: exports.trialDays };
    }
    const now = new Date().getTime();
    const thenMs = typeof trialStartedAt === 'number' ? trialStartedAt : trialStartedAt.getTime();
    const dayInMs = 1000 * 60 * 60 * 24;
    const sevenDays = dayInMs * exports.trialDays; // in milliseconds
    if (now - thenMs < sevenDays) {
        const diff = thenMs + sevenDays - now;
        const remainingDays = Math.ceil(diff / dayInMs);
        return { status: 'active', remainingDays };
    }
    else {
        return { status: 'expired', remainingDays: 0 };
    }
};
exports.computeTrialState = computeTrialState;


/***/ }),

/***/ 67429:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
Object.defineProperty(exports, "NIL", ({
  enumerable: true,
  get: function get() {
    return _nil.default;
  }
}));
Object.defineProperty(exports, "parse", ({
  enumerable: true,
  get: function get() {
    return _parse.default;
  }
}));
Object.defineProperty(exports, "stringify", ({
  enumerable: true,
  get: function get() {
    return _stringify.default;
  }
}));
Object.defineProperty(exports, "v1", ({
  enumerable: true,
  get: function get() {
    return _v.default;
  }
}));
Object.defineProperty(exports, "v3", ({
  enumerable: true,
  get: function get() {
    return _v2.default;
  }
}));
Object.defineProperty(exports, "v4", ({
  enumerable: true,
  get: function get() {
    return _v3.default;
  }
}));
Object.defineProperty(exports, "v5", ({
  enumerable: true,
  get: function get() {
    return _v4.default;
  }
}));
Object.defineProperty(exports, "validate", ({
  enumerable: true,
  get: function get() {
    return _validate.default;
  }
}));
Object.defineProperty(exports, "version", ({
  enumerable: true,
  get: function get() {
    return _version.default;
  }
}));

var _v = _interopRequireDefault(__webpack_require__(63990));

var _v2 = _interopRequireDefault(__webpack_require__(8237));

var _v3 = _interopRequireDefault(__webpack_require__(75355));

var _v4 = _interopRequireDefault(__webpack_require__(83764));

var _nil = _interopRequireDefault(__webpack_require__(86314));

var _version = _interopRequireDefault(__webpack_require__(58464));

var _validate = _interopRequireDefault(__webpack_require__(46435));

var _stringify = _interopRequireDefault(__webpack_require__(73990));

var _parse = _interopRequireDefault(__webpack_require__(18222));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),

/***/ 94163:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

/*
 * Browser-compatible JavaScript MD5
 *
 * Modification of JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */
function md5(bytes) {
  if (typeof bytes === 'string') {
    const msg = unescape(encodeURIComponent(bytes)); // UTF8 escape

    bytes = new Uint8Array(msg.length);

    for (let i = 0; i < msg.length; ++i) {
      bytes[i] = msg.charCodeAt(i);
    }
  }

  return md5ToHexEncodedArray(wordsToMd5(bytesToWords(bytes), bytes.length * 8));
}
/*
 * Convert an array of little-endian words to an array of bytes
 */


function md5ToHexEncodedArray(input) {
  const output = [];
  const length32 = input.length * 32;
  const hexTab = '0123456789abcdef';

  for (let i = 0; i < length32; i += 8) {
    const x = input[i >> 5] >>> i % 32 & 0xff;
    const hex = parseInt(hexTab.charAt(x >>> 4 & 0x0f) + hexTab.charAt(x & 0x0f), 16);
    output.push(hex);
  }

  return output;
}
/**
 * Calculate output length with padding and bit length
 */


function getOutputLength(inputLength8) {
  return (inputLength8 + 64 >>> 9 << 4) + 14 + 1;
}
/*
 * Calculate the MD5 of an array of little-endian words, and a bit length.
 */


function wordsToMd5(x, len) {
  /* append padding */
  x[len >> 5] |= 0x80 << len % 32;
  x[getOutputLength(len) - 1] = len;
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < x.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;
    a = md5ff(a, b, c, d, x[i], 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, x[i], 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, x[i], 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = md5ii(a, b, c, d, x[i], 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  return [a, b, c, d];
}
/*
 * Convert an array bytes to an array of little-endian words
 * Characters >255 have their high-byte silently ignored.
 */


function bytesToWords(input) {
  if (input.length === 0) {
    return [];
  }

  const length8 = input.length * 8;
  const output = new Uint32Array(getOutputLength(length8));

  for (let i = 0; i < length8; i += 8) {
    output[i >> 5] |= (input[i / 8] & 0xff) << i % 32;
  }

  return output;
}
/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */


function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return msw << 16 | lsw & 0xffff;
}
/*
 * Bitwise rotate a 32-bit number to the left.
 */


function bitRotateLeft(num, cnt) {
  return num << cnt | num >>> 32 - cnt;
}
/*
 * These functions implement the four basic operations the algorithm uses.
 */


function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5ff(a, b, c, d, x, s, t) {
  return md5cmn(b & c | ~b & d, a, b, x, s, t);
}

function md5gg(a, b, c, d, x, s, t) {
  return md5cmn(b & d | c & ~d, a, b, x, s, t);
}

function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

var _default = md5;
exports["default"] = _default;

/***/ }),

/***/ 54790:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
const randomUUID = typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var _default = {
  randomUUID
};
exports["default"] = _default;

/***/ }),

/***/ 86314:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _default = '00000000-0000-0000-0000-000000000000';
exports["default"] = _default;

/***/ }),

/***/ 18222:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _validate = _interopRequireDefault(__webpack_require__(46435));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function parse(uuid) {
  if (!(0, _validate.default)(uuid)) {
    throw TypeError('Invalid UUID');
  }

  let v;
  const arr = new Uint8Array(16); // Parse ########-....-....-....-............

  arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  arr[1] = v >>> 16 & 0xff;
  arr[2] = v >>> 8 & 0xff;
  arr[3] = v & 0xff; // Parse ........-####-....-....-............

  arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  arr[5] = v & 0xff; // Parse ........-....-####-....-............

  arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  arr[7] = v & 0xff; // Parse ........-....-....-####-............

  arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  arr[9] = v & 0xff; // Parse ........-....-....-....-############
  // (Use "/" to avoid 32-bit truncation when bit-shifting high-order bytes)

  arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 0x10000000000 & 0xff;
  arr[11] = v / 0x100000000 & 0xff;
  arr[12] = v >>> 24 & 0xff;
  arr[13] = v >>> 16 & 0xff;
  arr[14] = v >>> 8 & 0xff;
  arr[15] = v & 0xff;
  return arr;
}

var _default = parse;
exports["default"] = _default;

/***/ }),

/***/ 70058:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
exports["default"] = _default;

/***/ }),

/***/ 33319:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = rng;
// Unique ID creation requires a high quality random # generator. In the browser we therefore
// require the crypto API and do not support built-in fallback to lower quality random number
// generators (like Math.random()).
let getRandomValues;
const rnds8 = new Uint8Array(16);

function rng() {
  // lazy load so that environments that need to polyfill have a chance to do so
  if (!getRandomValues) {
    // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation.
    getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);

    if (!getRandomValues) {
      throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
    }
  }

  return getRandomValues(rnds8);
}

/***/ }),

/***/ 93757:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

// Adapted from Chris Veness' SHA1 code at
// http://www.movable-type.co.uk/scripts/sha1.html
function f(s, x, y, z) {
  switch (s) {
    case 0:
      return x & y ^ ~x & z;

    case 1:
      return x ^ y ^ z;

    case 2:
      return x & y ^ x & z ^ y & z;

    case 3:
      return x ^ y ^ z;
  }
}

function ROTL(x, n) {
  return x << n | x >>> 32 - n;
}

function sha1(bytes) {
  const K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
  const H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

  if (typeof bytes === 'string') {
    const msg = unescape(encodeURIComponent(bytes)); // UTF8 escape

    bytes = [];

    for (let i = 0; i < msg.length; ++i) {
      bytes.push(msg.charCodeAt(i));
    }
  } else if (!Array.isArray(bytes)) {
    // Convert Array-like to Array
    bytes = Array.prototype.slice.call(bytes);
  }

  bytes.push(0x80);
  const l = bytes.length / 4 + 2;
  const N = Math.ceil(l / 16);
  const M = new Array(N);

  for (let i = 0; i < N; ++i) {
    const arr = new Uint32Array(16);

    for (let j = 0; j < 16; ++j) {
      arr[j] = bytes[i * 64 + j * 4] << 24 | bytes[i * 64 + j * 4 + 1] << 16 | bytes[i * 64 + j * 4 + 2] << 8 | bytes[i * 64 + j * 4 + 3];
    }

    M[i] = arr;
  }

  M[N - 1][14] = (bytes.length - 1) * 8 / Math.pow(2, 32);
  M[N - 1][14] = Math.floor(M[N - 1][14]);
  M[N - 1][15] = (bytes.length - 1) * 8 & 0xffffffff;

  for (let i = 0; i < N; ++i) {
    const W = new Uint32Array(80);

    for (let t = 0; t < 16; ++t) {
      W[t] = M[i][t];
    }

    for (let t = 16; t < 80; ++t) {
      W[t] = ROTL(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];

    for (let t = 0; t < 80; ++t) {
      const s = Math.floor(t / 20);
      const T = ROTL(a, 5) + f(s, b, c, d) + e + K[s] + W[t] >>> 0;
      e = d;
      d = c;
      c = ROTL(b, 30) >>> 0;
      b = a;
      a = T;
    }

    H[0] = H[0] + a >>> 0;
    H[1] = H[1] + b >>> 0;
    H[2] = H[2] + c >>> 0;
    H[3] = H[3] + d >>> 0;
    H[4] = H[4] + e >>> 0;
  }

  return [H[0] >> 24 & 0xff, H[0] >> 16 & 0xff, H[0] >> 8 & 0xff, H[0] & 0xff, H[1] >> 24 & 0xff, H[1] >> 16 & 0xff, H[1] >> 8 & 0xff, H[1] & 0xff, H[2] >> 24 & 0xff, H[2] >> 16 & 0xff, H[2] >> 8 & 0xff, H[2] & 0xff, H[3] >> 24 & 0xff, H[3] >> 16 & 0xff, H[3] >> 8 & 0xff, H[3] & 0xff, H[4] >> 24 & 0xff, H[4] >> 16 & 0xff, H[4] >> 8 & 0xff, H[4] & 0xff];
}

var _default = sha1;
exports["default"] = _default;

/***/ }),

/***/ 73990:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
exports.unsafeStringify = unsafeStringify;

var _validate = _interopRequireDefault(__webpack_require__(46435));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
const byteToHex = [];

for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1));
}

function unsafeStringify(arr, offset = 0) {
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

function stringify(arr, offset = 0) {
  const uuid = unsafeStringify(arr, offset); // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields

  if (!(0, _validate.default)(uuid)) {
    throw TypeError('Stringified UUID is invalid');
  }

  return uuid;
}

var _default = stringify;
exports["default"] = _default;

/***/ }),

/***/ 63990:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _rng = _interopRequireDefault(__webpack_require__(33319));

var _stringify = __webpack_require__(73990);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html
let _nodeId;

let _clockseq; // Previous uuid creation time


let _lastMSecs = 0;
let _lastNSecs = 0; // See https://github.com/uuidjs/uuid for API details

function v1(options, buf, offset) {
  let i = buf && offset || 0;
  const b = buf || new Array(16);
  options = options || {};
  let node = options.node || _nodeId;
  let clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq; // node and clockseq need to be initialized to random values if they're not
  // specified.  We do this lazily to minimize issues related to insufficient
  // system entropy.  See #189

  if (node == null || clockseq == null) {
    const seedBytes = options.random || (options.rng || _rng.default)();

    if (node == null) {
      // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
      node = _nodeId = [seedBytes[0] | 0x01, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
    }

    if (clockseq == null) {
      // Per 4.2.2, randomize (14 bit) clockseq
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
    }
  } // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.


  let msecs = options.msecs !== undefined ? options.msecs : Date.now(); // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock

  let nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1; // Time since last uuid creation (in msecs)

  const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 10000; // Per 4.2.1.2, Bump clockseq on clock regression

  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  } // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval


  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  } // Per 4.2.1.2 Throw error if too many uuids are requested


  if (nsecs >= 10000) {
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq; // Per 4.1.4 - Convert from unix epoch to Gregorian epoch

  msecs += 12219292800000; // `time_low`

  const tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff; // `time_mid`

  const tmh = msecs / 0x100000000 * 10000 & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff; // `time_high_and_version`

  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version

  b[i++] = tmh >>> 16 & 0xff; // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)

  b[i++] = clockseq >>> 8 | 0x80; // `clock_seq_low`

  b[i++] = clockseq & 0xff; // `node`

  for (let n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf || (0, _stringify.unsafeStringify)(b);
}

var _default = v1;
exports["default"] = _default;

/***/ }),

/***/ 8237:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _v = _interopRequireDefault(__webpack_require__(17925));

var _md = _interopRequireDefault(__webpack_require__(94163));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const v3 = (0, _v.default)('v3', 0x30, _md.default);
var _default = v3;
exports["default"] = _default;

/***/ }),

/***/ 17925:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.URL = exports.DNS = void 0;
exports["default"] = v35;

var _stringify = __webpack_require__(73990);

var _parse = _interopRequireDefault(__webpack_require__(18222));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function stringToBytes(str) {
  str = unescape(encodeURIComponent(str)); // UTF8 escape

  const bytes = [];

  for (let i = 0; i < str.length; ++i) {
    bytes.push(str.charCodeAt(i));
  }

  return bytes;
}

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
exports.DNS = DNS;
const URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
exports.URL = URL;

function v35(name, version, hashfunc) {
  function generateUUID(value, namespace, buf, offset) {
    var _namespace;

    if (typeof value === 'string') {
      value = stringToBytes(value);
    }

    if (typeof namespace === 'string') {
      namespace = (0, _parse.default)(namespace);
    }

    if (((_namespace = namespace) === null || _namespace === void 0 ? void 0 : _namespace.length) !== 16) {
      throw TypeError('Namespace must be array-like (16 iterable integer values, 0-255)');
    } // Compute hash of namespace and value, Per 4.3
    // Future: Use spread syntax when supported on all platforms, e.g. `bytes =
    // hashfunc([...namespace, ... value])`


    let bytes = new Uint8Array(16 + value.length);
    bytes.set(namespace);
    bytes.set(value, namespace.length);
    bytes = hashfunc(bytes);
    bytes[6] = bytes[6] & 0x0f | version;
    bytes[8] = bytes[8] & 0x3f | 0x80;

    if (buf) {
      offset = offset || 0;

      for (let i = 0; i < 16; ++i) {
        buf[offset + i] = bytes[i];
      }

      return buf;
    }

    return (0, _stringify.unsafeStringify)(bytes);
  } // Function#name is not settable on some platforms (#270)


  try {
    generateUUID.name = name; // eslint-disable-next-line no-empty
  } catch (err) {} // For CommonJS default export support


  generateUUID.DNS = DNS;
  generateUUID.URL = URL;
  return generateUUID;
}

/***/ }),

/***/ 75355:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _native = _interopRequireDefault(__webpack_require__(54790));

var _rng = _interopRequireDefault(__webpack_require__(33319));

var _stringify = __webpack_require__(73990);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function v4(options, buf, offset) {
  if (_native.default.randomUUID && !buf && !options) {
    return _native.default.randomUUID();
  }

  options = options || {};

  const rnds = options.random || (options.rng || _rng.default)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`


  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

  if (buf) {
    offset = offset || 0;

    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return (0, _stringify.unsafeStringify)(rnds);
}

var _default = v4;
exports["default"] = _default;

/***/ }),

/***/ 83764:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _v = _interopRequireDefault(__webpack_require__(17925));

var _sha = _interopRequireDefault(__webpack_require__(93757));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const v5 = (0, _v.default)('v5', 0x50, _sha.default);
var _default = v5;
exports["default"] = _default;

/***/ }),

/***/ 46435:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _regex = _interopRequireDefault(__webpack_require__(70058));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function validate(uuid) {
  return typeof uuid === 'string' && _regex.default.test(uuid);
}

var _default = validate;
exports["default"] = _default;

/***/ }),

/***/ 58464:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;

var _validate = _interopRequireDefault(__webpack_require__(46435));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function version(uuid) {
  if (!(0, _validate.default)(uuid)) {
    throw TypeError('Invalid UUID');
  }

  return parseInt(uuid.slice(14, 15), 16);
}

var _default = version;
exports["default"] = _default;

/***/ }),

/***/ 93150:
/***/ (function(module, exports) {

var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;(function (global, factory) {
  if (true) {
    !(__WEBPACK_AMD_DEFINE_ARRAY__ = [module], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory),
		__WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ?
		(__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__),
		__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
  } else { var mod; }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (module) {
  /* webextension-polyfill - v0.7.0 - Tue Nov 10 2020 20:24:04 */

  /* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */

  /* vim: set sts=2 sw=2 et tw=80: */

  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
  "use strict";

  if (typeof browser === "undefined" || Object.getPrototypeOf(browser) !== Object.prototype) {
    const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";
    const SEND_RESPONSE_DEPRECATION_WARNING = "Returning a Promise is the preferred way to send a reply from an onMessage/onMessageExternal listener, as the sendResponse will be removed from the specs (See https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)"; // Wrapping the bulk of this polyfill in a one-time-use function is a minor
    // optimization for Firefox. Since Spidermonkey does not fully parse the
    // contents of a function until the first time it's called, and since it will
    // never actually need to be called, this allows the polyfill to be included
    // in Firefox nearly for free.

    const wrapAPIs = extensionAPIs => {
      // NOTE: apiMetadata is associated to the content of the api-metadata.json file
      // at build time by replacing the following "include" with the content of the
      // JSON file.
      const apiMetadata = {
        "alarms": {
          "clear": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "clearAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "get": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "bookmarks": {
          "create": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getChildren": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getRecent": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getSubTree": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getTree": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "move": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeTree": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "search": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        },
        "browserAction": {
          "disable": {
            "minArgs": 0,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "enable": {
            "minArgs": 0,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "getBadgeBackgroundColor": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getBadgeText": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getPopup": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getTitle": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "openPopup": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "setBadgeBackgroundColor": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setBadgeText": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setIcon": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "setPopup": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setTitle": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          }
        },
        "browsingData": {
          "remove": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "removeCache": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeCookies": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeDownloads": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeFormData": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeHistory": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeLocalStorage": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removePasswords": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removePluginData": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "settings": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "commands": {
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "contextMenus": {
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        },
        "cookies": {
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAllCookieStores": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "set": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "devtools": {
          "inspectedWindow": {
            "eval": {
              "minArgs": 1,
              "maxArgs": 2,
              "singleCallbackArg": false
            }
          },
          "panels": {
            "create": {
              "minArgs": 3,
              "maxArgs": 3,
              "singleCallbackArg": true
            },
            "elements": {
              "createSidebarPane": {
                "minArgs": 1,
                "maxArgs": 1
              }
            }
          }
        },
        "downloads": {
          "cancel": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "download": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "erase": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getFileIcon": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "open": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "pause": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeFile": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "resume": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "search": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "show": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          }
        },
        "extension": {
          "isAllowedFileSchemeAccess": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "isAllowedIncognitoAccess": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "history": {
          "addUrl": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "deleteAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "deleteRange": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "deleteUrl": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getVisits": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "search": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "i18n": {
          "detectLanguage": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAcceptLanguages": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "identity": {
          "launchWebAuthFlow": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "idle": {
          "queryState": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "management": {
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getSelf": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "setEnabled": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "uninstallSelf": {
            "minArgs": 0,
            "maxArgs": 1
          }
        },
        "notifications": {
          "clear": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "create": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getPermissionLevel": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        },
        "pageAction": {
          "getPopup": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getTitle": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "hide": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setIcon": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "setPopup": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setTitle": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "show": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          }
        },
        "permissions": {
          "contains": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "request": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "runtime": {
          "getBackgroundPage": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getPlatformInfo": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "openOptionsPage": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "requestUpdateCheck": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "sendMessage": {
            "minArgs": 1,
            "maxArgs": 3
          },
          "sendNativeMessage": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "setUninstallURL": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "sessions": {
          "getDevices": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getRecentlyClosed": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "restore": {
            "minArgs": 0,
            "maxArgs": 1
          }
        },
        "storage": {
          "local": {
            "clear": {
              "minArgs": 0,
              "maxArgs": 0
            },
            "get": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "getBytesInUse": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "remove": {
              "minArgs": 1,
              "maxArgs": 1
            },
            "set": {
              "minArgs": 1,
              "maxArgs": 1
            }
          },
          "managed": {
            "get": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "getBytesInUse": {
              "minArgs": 0,
              "maxArgs": 1
            }
          },
          "sync": {
            "clear": {
              "minArgs": 0,
              "maxArgs": 0
            },
            "get": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "getBytesInUse": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "remove": {
              "minArgs": 1,
              "maxArgs": 1
            },
            "set": {
              "minArgs": 1,
              "maxArgs": 1
            }
          }
        },
        "tabs": {
          "captureVisibleTab": {
            "minArgs": 0,
            "maxArgs": 2
          },
          "create": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "detectLanguage": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "discard": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "duplicate": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "executeScript": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getCurrent": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getZoom": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getZoomSettings": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "goBack": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "goForward": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "highlight": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "insertCSS": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "move": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "query": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "reload": {
            "minArgs": 0,
            "maxArgs": 2
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeCSS": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "sendMessage": {
            "minArgs": 2,
            "maxArgs": 3
          },
          "setZoom": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "setZoomSettings": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "update": {
            "minArgs": 1,
            "maxArgs": 2
          }
        },
        "topSites": {
          "get": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "webNavigation": {
          "getAllFrames": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getFrame": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "webRequest": {
          "handlerBehaviorChanged": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "windows": {
          "create": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "get": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getCurrent": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getLastFocused": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        }
      };

      if (Object.keys(apiMetadata).length === 0) {
        throw new Error("api-metadata.json has not been included in browser-polyfill");
      }
      /**
       * A WeakMap subclass which creates and stores a value for any key which does
       * not exist when accessed, but behaves exactly as an ordinary WeakMap
       * otherwise.
       *
       * @param {function} createItem
       *        A function which will be called in order to create the value for any
       *        key which does not exist, the first time it is accessed. The
       *        function receives, as its only argument, the key being created.
       */


      class DefaultWeakMap extends WeakMap {
        constructor(createItem, items = undefined) {
          super(items);
          this.createItem = createItem;
        }

        get(key) {
          if (!this.has(key)) {
            this.set(key, this.createItem(key));
          }

          return super.get(key);
        }

      }
      /**
       * Returns true if the given object is an object with a `then` method, and can
       * therefore be assumed to behave as a Promise.
       *
       * @param {*} value The value to test.
       * @returns {boolean} True if the value is thenable.
       */


      const isThenable = value => {
        return value && typeof value === "object" && typeof value.then === "function";
      };
      /**
       * Creates and returns a function which, when called, will resolve or reject
       * the given promise based on how it is called:
       *
       * - If, when called, `chrome.runtime.lastError` contains a non-null object,
       *   the promise is rejected with that value.
       * - If the function is called with exactly one argument, the promise is
       *   resolved to that value.
       * - Otherwise, the promise is resolved to an array containing all of the
       *   function's arguments.
       *
       * @param {object} promise
       *        An object containing the resolution and rejection functions of a
       *        promise.
       * @param {function} promise.resolve
       *        The promise's resolution function.
       * @param {function} promise.rejection
       *        The promise's rejection function.
       * @param {object} metadata
       *        Metadata about the wrapped method which has created the callback.
       * @param {integer} metadata.maxResolvedArgs
       *        The maximum number of arguments which may be passed to the
       *        callback created by the wrapped async function.
       *
       * @returns {function}
       *        The generated callback function.
       */


      const makeCallback = (promise, metadata) => {
        return (...callbackArgs) => {
          if (extensionAPIs.runtime.lastError) {
            promise.reject(extensionAPIs.runtime.lastError);
          } else if (metadata.singleCallbackArg || callbackArgs.length <= 1 && metadata.singleCallbackArg !== false) {
            promise.resolve(callbackArgs[0]);
          } else {
            promise.resolve(callbackArgs);
          }
        };
      };

      const pluralizeArguments = numArgs => numArgs == 1 ? "argument" : "arguments";
      /**
       * Creates a wrapper function for a method with the given name and metadata.
       *
       * @param {string} name
       *        The name of the method which is being wrapped.
       * @param {object} metadata
       *        Metadata about the method being wrapped.
       * @param {integer} metadata.minArgs
       *        The minimum number of arguments which must be passed to the
       *        function. If called with fewer than this number of arguments, the
       *        wrapper will raise an exception.
       * @param {integer} metadata.maxArgs
       *        The maximum number of arguments which may be passed to the
       *        function. If called with more than this number of arguments, the
       *        wrapper will raise an exception.
       * @param {integer} metadata.maxResolvedArgs
       *        The maximum number of arguments which may be passed to the
       *        callback created by the wrapped async function.
       *
       * @returns {function(object, ...*)}
       *       The generated wrapper function.
       */


      const wrapAsyncFunction = (name, metadata) => {
        return function asyncFunctionWrapper(target, ...args) {
          if (args.length < metadata.minArgs) {
            throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
          }

          if (args.length > metadata.maxArgs) {
            throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
          }

          return new Promise((resolve, reject) => {
            if (metadata.fallbackToNoCallback) {
              // This API method has currently no callback on Chrome, but it return a promise on Firefox,
              // and so the polyfill will try to call it with a callback first, and it will fallback
              // to not passing the callback if the first call fails.
              try {
                target[name](...args, makeCallback({
                  resolve,
                  reject
                }, metadata));
              } catch (cbError) {
                console.warn(`${name} API method doesn't seem to support the callback parameter, ` + "falling back to call it without a callback: ", cbError);
                target[name](...args); // Update the API method metadata, so that the next API calls will not try to
                // use the unsupported callback anymore.

                metadata.fallbackToNoCallback = false;
                metadata.noCallback = true;
                resolve();
              }
            } else if (metadata.noCallback) {
              target[name](...args);
              resolve();
            } else {
              target[name](...args, makeCallback({
                resolve,
                reject
              }, metadata));
            }
          });
        };
      };
      /**
       * Wraps an existing method of the target object, so that calls to it are
       * intercepted by the given wrapper function. The wrapper function receives,
       * as its first argument, the original `target` object, followed by each of
       * the arguments passed to the original method.
       *
       * @param {object} target
       *        The original target object that the wrapped method belongs to.
       * @param {function} method
       *        The method being wrapped. This is used as the target of the Proxy
       *        object which is created to wrap the method.
       * @param {function} wrapper
       *        The wrapper function which is called in place of a direct invocation
       *        of the wrapped method.
       *
       * @returns {Proxy<function>}
       *        A Proxy object for the given method, which invokes the given wrapper
       *        method in its place.
       */


      const wrapMethod = (target, method, wrapper) => {
        return new Proxy(method, {
          apply(targetMethod, thisObj, args) {
            return wrapper.call(thisObj, target, ...args);
          }

        });
      };

      let hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);
      /**
       * Wraps an object in a Proxy which intercepts and wraps certain methods
       * based on the given `wrappers` and `metadata` objects.
       *
       * @param {object} target
       *        The target object to wrap.
       *
       * @param {object} [wrappers = {}]
       *        An object tree containing wrapper functions for special cases. Any
       *        function present in this object tree is called in place of the
       *        method in the same location in the `target` object tree. These
       *        wrapper methods are invoked as described in {@see wrapMethod}.
       *
       * @param {object} [metadata = {}]
       *        An object tree containing metadata used to automatically generate
       *        Promise-based wrapper functions for asynchronous. Any function in
       *        the `target` object tree which has a corresponding metadata object
       *        in the same location in the `metadata` tree is replaced with an
       *        automatically-generated wrapper function, as described in
       *        {@see wrapAsyncFunction}
       *
       * @returns {Proxy<object>}
       */

      const wrapObject = (target, wrappers = {}, metadata = {}) => {
        let cache = Object.create(null);
        let handlers = {
          has(proxyTarget, prop) {
            return prop in target || prop in cache;
          },

          get(proxyTarget, prop, receiver) {
            if (prop in cache) {
              return cache[prop];
            }

            if (!(prop in target)) {
              return undefined;
            }

            let value = target[prop];

            if (typeof value === "function") {
              // This is a method on the underlying object. Check if we need to do
              // any wrapping.
              if (typeof wrappers[prop] === "function") {
                // We have a special-case wrapper for this method.
                value = wrapMethod(target, target[prop], wrappers[prop]);
              } else if (hasOwnProperty(metadata, prop)) {
                // This is an async method that we have metadata for. Create a
                // Promise wrapper for it.
                let wrapper = wrapAsyncFunction(prop, metadata[prop]);
                value = wrapMethod(target, target[prop], wrapper);
              } else {
                // This is a method that we don't know or care about. Return the
                // original method, bound to the underlying object.
                value = value.bind(target);
              }
            } else if (typeof value === "object" && value !== null && (hasOwnProperty(wrappers, prop) || hasOwnProperty(metadata, prop))) {
              // This is an object that we need to do some wrapping for the children
              // of. Create a sub-object wrapper for it with the appropriate child
              // metadata.
              value = wrapObject(value, wrappers[prop], metadata[prop]);
            } else if (hasOwnProperty(metadata, "*")) {
              // Wrap all properties in * namespace.
              value = wrapObject(value, wrappers[prop], metadata["*"]);
            } else {
              // We don't need to do any wrapping for this property,
              // so just forward all access to the underlying object.
              Object.defineProperty(cache, prop, {
                configurable: true,
                enumerable: true,

                get() {
                  return target[prop];
                },

                set(value) {
                  target[prop] = value;
                }

              });
              return value;
            }

            cache[prop] = value;
            return value;
          },

          set(proxyTarget, prop, value, receiver) {
            if (prop in cache) {
              cache[prop] = value;
            } else {
              target[prop] = value;
            }

            return true;
          },

          defineProperty(proxyTarget, prop, desc) {
            return Reflect.defineProperty(cache, prop, desc);
          },

          deleteProperty(proxyTarget, prop) {
            return Reflect.deleteProperty(cache, prop);
          }

        }; // Per contract of the Proxy API, the "get" proxy handler must return the
        // original value of the target if that value is declared read-only and
        // non-configurable. For this reason, we create an object with the
        // prototype set to `target` instead of using `target` directly.
        // Otherwise we cannot return a custom object for APIs that
        // are declared read-only and non-configurable, such as `chrome.devtools`.
        //
        // The proxy handlers themselves will still use the original `target`
        // instead of the `proxyTarget`, so that the methods and properties are
        // dereferenced via the original targets.

        let proxyTarget = Object.create(target);
        return new Proxy(proxyTarget, handlers);
      };
      /**
       * Creates a set of wrapper functions for an event object, which handles
       * wrapping of listener functions that those messages are passed.
       *
       * A single wrapper is created for each listener function, and stored in a
       * map. Subsequent calls to `addListener`, `hasListener`, or `removeListener`
       * retrieve the original wrapper, so that  attempts to remove a
       * previously-added listener work as expected.
       *
       * @param {DefaultWeakMap<function, function>} wrapperMap
       *        A DefaultWeakMap object which will create the appropriate wrapper
       *        for a given listener function when one does not exist, and retrieve
       *        an existing one when it does.
       *
       * @returns {object}
       */


      const wrapEvent = wrapperMap => ({
        addListener(target, listener, ...args) {
          target.addListener(wrapperMap.get(listener), ...args);
        },

        hasListener(target, listener) {
          return target.hasListener(wrapperMap.get(listener));
        },

        removeListener(target, listener) {
          target.removeListener(wrapperMap.get(listener));
        }

      }); // Keep track if the deprecation warning has been logged at least once.


      let loggedSendResponseDeprecationWarning = false;
      const onMessageWrappers = new DefaultWeakMap(listener => {
        if (typeof listener !== "function") {
          return listener;
        }
        /**
         * Wraps a message listener function so that it may send responses based on
         * its return value, rather than by returning a sentinel value and calling a
         * callback. If the listener function returns a Promise, the response is
         * sent when the promise either resolves or rejects.
         *
         * @param {*} message
         *        The message sent by the other end of the channel.
         * @param {object} sender
         *        Details about the sender of the message.
         * @param {function(*)} sendResponse
         *        A callback which, when called with an arbitrary argument, sends
         *        that value as a response.
         * @returns {boolean}
         *        True if the wrapped listener returned a Promise, which will later
         *        yield a response. False otherwise.
         */


        return function onMessage(message, sender, sendResponse) {
          let didCallSendResponse = false;
          let wrappedSendResponse;
          let sendResponsePromise = new Promise(resolve => {
            wrappedSendResponse = function (response) {
              if (!loggedSendResponseDeprecationWarning) {
                console.warn(SEND_RESPONSE_DEPRECATION_WARNING, new Error().stack);
                loggedSendResponseDeprecationWarning = true;
              }

              didCallSendResponse = true;
              resolve(response);
            };
          });
          let result;

          try {
            result = listener(message, sender, wrappedSendResponse);
          } catch (err) {
            result = Promise.reject(err);
          }

          const isResultThenable = result !== true && isThenable(result); // If the listener didn't returned true or a Promise, or called
          // wrappedSendResponse synchronously, we can exit earlier
          // because there will be no response sent from this listener.

          if (result !== true && !isResultThenable && !didCallSendResponse) {
            return false;
          } // A small helper to send the message if the promise resolves
          // and an error if the promise rejects (a wrapped sendMessage has
          // to translate the message into a resolved promise or a rejected
          // promise).


          const sendPromisedResult = promise => {
            promise.then(msg => {
              // send the message value.
              sendResponse(msg);
            }, error => {
              // Send a JSON representation of the error if the rejected value
              // is an instance of error, or the object itself otherwise.
              let message;

              if (error && (error instanceof Error || typeof error.message === "string")) {
                message = error.message;
              } else {
                message = "An unexpected error occurred";
              }

              sendResponse({
                __mozWebExtensionPolyfillReject__: true,
                message
              });
            }).catch(err => {
              // Print an error on the console if unable to send the response.
              console.error("Failed to send onMessage rejected reply", err);
            });
          }; // If the listener returned a Promise, send the resolved value as a
          // result, otherwise wait the promise related to the wrappedSendResponse
          // callback to resolve and send it as a response.


          if (isResultThenable) {
            sendPromisedResult(result);
          } else {
            sendPromisedResult(sendResponsePromise);
          } // Let Chrome know that the listener is replying.


          return true;
        };
      });

      const wrappedSendMessageCallback = ({
        reject,
        resolve
      }, reply) => {
        if (extensionAPIs.runtime.lastError) {
          // Detect when none of the listeners replied to the sendMessage call and resolve
          // the promise to undefined as in Firefox.
          // See https://github.com/mozilla/webextension-polyfill/issues/130
          if (extensionAPIs.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE) {
            resolve();
          } else {
            reject(extensionAPIs.runtime.lastError);
          }
        } else if (reply && reply.__mozWebExtensionPolyfillReject__) {
          // Convert back the JSON representation of the error into
          // an Error instance.
          reject(new Error(reply.message));
        } else {
          resolve(reply);
        }
      };

      const wrappedSendMessage = (name, metadata, apiNamespaceObj, ...args) => {
        if (args.length < metadata.minArgs) {
          throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
        }

        if (args.length > metadata.maxArgs) {
          throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
        }

        return new Promise((resolve, reject) => {
          const wrappedCb = wrappedSendMessageCallback.bind(null, {
            resolve,
            reject
          });
          args.push(wrappedCb);
          apiNamespaceObj.sendMessage(...args);
        });
      };

      const staticWrappers = {
        runtime: {
          onMessage: wrapEvent(onMessageWrappers),
          onMessageExternal: wrapEvent(onMessageWrappers),
          sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
            minArgs: 1,
            maxArgs: 3
          })
        },
        tabs: {
          sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
            minArgs: 2,
            maxArgs: 3
          })
        }
      };
      const settingMetadata = {
        clear: {
          minArgs: 1,
          maxArgs: 1
        },
        get: {
          minArgs: 1,
          maxArgs: 1
        },
        set: {
          minArgs: 1,
          maxArgs: 1
        }
      };
      apiMetadata.privacy = {
        network: {
          "*": settingMetadata
        },
        services: {
          "*": settingMetadata
        },
        websites: {
          "*": settingMetadata
        }
      };
      return wrapObject(extensionAPIs, staticWrappers, apiMetadata);
    };

    if (typeof chrome != "object" || !chrome || !chrome.runtime || !chrome.runtime.id) {
      throw new Error("This script should only be loaded in a browser extension.");
    } // The build process adds a UMD wrapper around this file, which makes the
    // `module` variable available.


    module.exports = wrapAPIs(chrome);
  } else {
    module.exports = browser;
  }
});
//# sourceMappingURL=browser-polyfill.js.map


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(98136);
/******/ 	
/******/ })()
;