// =========================================================
// Plik: assets/js/common.js
// Spis treści funkcji:
// 1. Inicjalizacja Supabase i konfiguracja formatera numerów
// 2. Obsługa sesji opartych o Supabase Auth
// 3. Wspólne narzędzia: formatowanie numerów, pamięć profilu
// 4. Inicjalizacja menu użytkownika i nawigacji
// =========================================================

(() => {
    const STORAGE_PROFILE_KEY = 'appProfile';
    const config = window.APP_CONFIG || {};
    const hasSupabaseConfig = Boolean(window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
    const supabaseClient = hasSupabaseConfig
        ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
        : null;

    const PHONE_PREFIX = '+48';

    // ----------------------------------------
    // 1. Narzędzia do formatowania numerów telefonu
    // ----------------------------------------
    function stripToDigits(value) {
        return value.replace(/\D+/g, '');
    }

    function normalizePhone(rawValue) {
        const digits = stripToDigits(rawValue);
        if (!digits) {
            return '';
        }
        let normalized = digits;
        if (!normalized.startsWith('48')) {
            normalized = `48${normalized}`;
        }
        normalized = normalized.slice(0, 11);
        const subscriber = normalized.slice(2);
        if (subscriber.length !== 9) {
            return '';
        }
        return `${PHONE_PREFIX}${subscriber}`;
    }

    function formatPhoneNumber(normalized) {
        if (!normalized) {
            return '';
        }
        const subscriber = normalized.slice(3);
        const groups = subscriber.match(/\d{1,3}/g) || [];
        return `${PHONE_PREFIX} ${groups.join(' ')}`.trim();
    }

    function attachPhoneFormatter(input) {
        if (!input) {
            return;
        }

        const moveCaretToEnd = () => {
            const end = input.value.length;
            input.setSelectionRange(end, end);
        };

        input.addEventListener('focus', () => {
            if (!stripToDigits(input.value).length) {
                input.value = `${PHONE_PREFIX} `;
                requestAnimationFrame(moveCaretToEnd);
            }
        });

        input.addEventListener('input', () => {
            const digits = stripToDigits(input.value);
            if (!digits.length) {
                input.value = `${PHONE_PREFIX} `;
                requestAnimationFrame(moveCaretToEnd);
                return;
            }

            let normalizedDigits = digits;
            if (!normalizedDigits.startsWith('48')) {
                normalizedDigits = `48${normalizedDigits}`;
            }
            normalizedDigits = normalizedDigits.slice(0, 11);
            const subscriber = normalizedDigits.slice(2);
            const groups = subscriber.match(/\d{1,3}/g) || [];
            input.value = `${PHONE_PREFIX} ${groups.join(' ')}`.trim();
            requestAnimationFrame(moveCaretToEnd);
        });

        input.addEventListener('blur', () => {
            const normalized = normalizePhone(input.value);
            input.value = normalized ? formatPhoneNumber(normalized) : '';
        });
    }

    function buildAuthEmail(normalizedPhone) {
        const safePhone = normalizedPhone.replace(/[^\d]/g, '');
        return `${safePhone}@panel.local`; // alias emailowy tylko do logowania
    }

    // ----------------------------------------
    // 2. Obsługa sesji Supabase Auth i pamięci profilu
    // ----------------------------------------
    function cacheProfile(profile) {
        try {
            localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
        } catch (error) {
            console.warn('Nie udało się zapisać profilu w pamięci:', error);
        }
    }

    function getCachedProfile() {
        try {
            const stored = localStorage.getItem(STORAGE_PROFILE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.warn('Nie udało się odczytać profilu z pamięci:', error);
            return null;
        }
    }

    function clearProfile() {
        localStorage.removeItem(STORAGE_PROFILE_KEY);
    }

    async function refreshProfile(user) {
        if (!supabaseClient || !user) {
            return null;
        }
        const { data, error } = await supabaseClient
            .from('registered_users')
            .select('phone, shift_code, ratownik, dowodca, kierowca, nurek, can_manage_command_order, authorized_users ( first_name, last_name, can_post_messages )')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.warn('Nie udało się pobrać profilu użytkownika:', error);
            return null;
        }

        if (!data) {
            return null;
        }

        const profile = {
            userId: user.id,
            phone: data.phone,
            shiftCode: data.shift_code,
            ratownik: Boolean(data.ratownik),
            dowodca: Boolean(data.dowodca),
            kierowca: Boolean(data.kierowca),
            nurek: Boolean(data.nurek),
            canManageCommandOrder: Boolean(data.can_manage_command_order),
            firstName: data.authorized_users?.first_name || '',
            lastName: data.authorized_users?.last_name || '',
            canPostMessages: Boolean(data.authorized_users?.can_post_messages),
        };
        cacheProfile(profile);
        return profile;
    }

    async function getActiveSession() {
        if (!supabaseClient) {
            return null;
        }
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.warn('Nie udało się pobrać sesji Supabase:', error);
            return null;
        }
        return data.session || null;
    }

    // ----------------------------------------
    // 3. Nawigacja i menu użytkownika
    // ----------------------------------------
    async function initApplication() {
        const body = document.body;
        const isAuthLayout = body.classList.contains('layout--auth');
        const session = await getActiveSession();

        if (isAuthLayout && session) {
            window.location.href = 'home.html';
            return;
        }

        if (!isAuthLayout && !session) {
            window.location.href = 'index.html';
            return;
        }

        highlightActiveLink();
        if (!isAuthLayout) {
            setupNavigationToggle();
            setupNavigationSubmenus();
            setupUserMenu(session);
        }
    }

    function highlightActiveLink() {
        const currentPage = document.body.dataset.page;
        if (!currentPage) {
            return;
        }
        const activeLink = document.querySelector(`.top-nav__links a[data-link="${currentPage}"]`);
        activeLink?.classList.add('is-active');
        if (activeLink) {
            const parentSubmenuItem = activeLink.closest('.top-nav__item--submenu');
            if (parentSubmenuItem) {
                parentSubmenuItem.classList.add('is-current-section');
                parentSubmenuItem.querySelector('.top-nav__submenu-toggle')?.classList.add('is-active');
            }
        }
    }

    function setupNavigationSubmenus() {
        const nav = document.querySelector('.top-nav');
        if (!nav) {
            return;
        }

        const submenuItems = Array.from(nav.querySelectorAll('.top-nav__item--submenu'));
        if (!submenuItems.length) {
            return;
        }

        const closeAll = () => {
            submenuItems.forEach((item) => {
                const toggle = item.querySelector('.top-nav__submenu-toggle');
                item.classList.remove('is-open');
                toggle?.setAttribute('aria-expanded', 'false');
                toggle?.blur();
                if (item.classList.contains('is-current-section')) {
                    toggle?.classList.add('is-active');
                } else {
                    toggle?.classList.remove('is-active');
                }
                item.querySelector('.top-nav__submenu')?.setAttribute('hidden', '');
            });
        };

        submenuItems.forEach((item, index) => {
            const toggle = item.querySelector('.top-nav__submenu-toggle');
            const submenu = item.querySelector('.top-nav__submenu');
            if (!toggle || !submenu) {
                return;
            }

            if (!submenu.id) {
                submenu.id = `top-nav-submenu-${index + 1}`;
            }
            toggle.setAttribute('aria-controls', submenu.id);
            toggle.setAttribute('aria-expanded', 'false');
            submenu.setAttribute('hidden', '');

            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                const willOpen = !item.classList.contains('is-open');
                closeAll();
                item.classList.toggle('is-open', willOpen);
                if (willOpen) {
                    submenu.removeAttribute('hidden');
                } else {
                    submenu.setAttribute('hidden', '');
                }
                toggle.setAttribute('aria-expanded', String(willOpen));
                toggle.classList.toggle('is-active', willOpen || item.classList.contains('is-current-section'));
            });

            submenu.querySelectorAll('a').forEach((link) => {
                link.addEventListener('click', () => {
                    const href = link.getAttribute('href') || '';
                    if (!href || href.startsWith('#')) {
                        closeAll();
                        return;
                    }

                    const currentPath = window.location.pathname.split('/').pop() || '';
                    const targetPath = href.split('/').pop();
                    if (targetPath === currentPath) {
                        closeAll();
                        return;
                    }

                    // Dla przejscia na inna strone nie blokujemy domyslnej nawigacji.
                    // Zamkniecie submenu odkladamy na kolejke, aby nie przerwac klikniecia linku.
                    setTimeout(closeAll, 0);
                });
            });
        });

        document.addEventListener('click', (event) => {
            if (!(event.target instanceof HTMLElement) || !event.target.closest('.top-nav__item--submenu')) {
                closeAll();
            }
        });
    }

    function setupNavigationToggle() {
        const nav = document.querySelector('.top-nav');
        const links = nav?.querySelector('.top-nav__links');
        if (!nav || !links) {
            return;
        }

        if (!links.id) {
            links.id = 'top-nav-links';
        }

        if (nav.querySelector('.top-nav__menu-toggle')) {
            return;
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'top-nav__menu-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', links.id);
        toggle.innerHTML = `
            <span class="top-nav__menu-icon" aria-hidden="true"></span>
            <span class="top-nav__menu-text">Menu</span>
        `;

        const closeMenu = () => {
            nav.classList.remove('top-nav--menu-open');
            toggle.setAttribute('aria-expanded', 'false');
        };

        toggle.addEventListener('click', () => {
            const willOpen = !nav.classList.contains('top-nav--menu-open');
            nav.classList.toggle('top-nav--menu-open', willOpen);
            toggle.setAttribute('aria-expanded', String(willOpen));
        });

        links.addEventListener('click', (event) => {
            if (event.target instanceof HTMLElement && event.target.closest('a') && window.matchMedia('(max-width: 768px)').matches) {
                closeMenu();
            }
        });

        const largeScreenQuery = window.matchMedia('(min-width: 769px)');
        const handleScreenChange = (event) => {
            if (event.matches) {
                closeMenu();
            }
        };

        if (typeof largeScreenQuery.addEventListener === 'function') {
            largeScreenQuery.addEventListener('change', handleScreenChange);
        } else if (typeof largeScreenQuery.addListener === 'function') {
            largeScreenQuery.addListener(handleScreenChange);
        }

        nav.insertBefore(toggle, links);
    }

    async function setupUserMenu(session) {
        const userSection = document.querySelector('.top-nav__user');
        if (!userSection) {
            return;
        }

        const toggle = userSection.querySelector('.top-nav__user-toggle');
        const menu = userSection.querySelector('.top-nav__user-menu');
        const logoutButton = menu?.querySelector('[data-action="logout"]');

        if (!toggle || !menu || !logoutButton) {
            return;
        }

        if (!session) {
            toggle.textContent = 'Konto';
            toggle.disabled = true;
            return;
        }

        let profile = getCachedProfile();
        if (!profile || profile.userId !== session.user.id) {
            profile = await refreshProfile(session.user);
        }

        if (profile) {
            const label = `${profile.firstName} ${profile.lastName}`.trim() || profile.phone;
            toggle.textContent = label;
        } else {
            toggle.textContent = 'Użytkownik';
        }

        const closeMenu = () => {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        };

        toggle.addEventListener('click', () => {
            const willOpen = menu.hidden;
            menu.hidden = !willOpen;
            toggle.setAttribute('aria-expanded', String(willOpen));
        });

        document.addEventListener('click', (event) => {
            if (!menu.hidden && !menu.contains(event.target) && event.target !== toggle) {
                closeMenu();
            }
        });

        logoutButton.addEventListener('click', async () => {
            if (supabaseClient) {
                await supabaseClient.auth.signOut();
            }
            clearProfile();
            closeMenu();
            window.location.href = 'index.html';
        });
    }

        function setupPwaInstallControl() {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) {
            return;
        }

        const ua = window.navigator.userAgent || '';
        const isIOS = /iphone|ipad|ipod/i.test(ua);
        const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opr\//i.test(ua);
        let deferredPrompt = null;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pwa-install-btn';
        button.setAttribute('aria-label', 'Zainstaluj aplikacje');
        button.innerHTML = `
            <span class="pwa-install-btn__icon" aria-hidden="true">+</span>
            <span class="pwa-install-btn__label">Zainstaluj</span>
        `;

        const showButton = () => {
            button.classList.add('is-visible');
        };

        const hideButton = () => {
            button.classList.remove('is-visible');
        };

        button.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                try {
                    await deferredPrompt.userChoice;
                } catch (error) {}
                deferredPrompt = null;
                hideButton();
                return;
            }

            if (isIOS && isSafari) {
                window.alert('Aby zainstalowac: kliknij Udostepnij i wybierz "Do ekranu poczatkowego".');
            }
        });

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredPrompt = event;
            showButton();
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            hideButton();
        });

        if (isIOS && isSafari) {
            showButton();
        }

        document.body.appendChild(button);
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupPwaInstallControl();

        if (!supabaseClient) {
            console.warn('Brak konfiguracji Supabase – funkcje logowania nie będą działać.');
            highlightActiveLink();
            return;
        }
        initApplication();
    });

    window.AppCommon = {
        supabase: supabaseClient,
        attachPhoneFormatter,
        validatePhone: (value) => Boolean(normalizePhone(value)),
        normalizePhone,
        formatPhoneNumber,
        stripPhoneDigits: stripToDigits,
        buildAuthEmail,
        cacheProfile,
        getCachedProfile,
        clearProfile,
        refreshProfile,
    };
})();

