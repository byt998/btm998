(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('login-form');
        const phoneInput = document.getElementById('login-phone');
        const passwordInput = document.getElementById('login-password');
        const errorBox = form.querySelector('.form-error');
        const registerButton = form.querySelector('[data-action="go-register"]');
        const submitButton = form.querySelector('button[type="submit"]');

        const {
            supabase,
            attachPhoneFormatter,
            validatePhone,
            normalizePhone,
            buildAuthEmail,
            refreshProfile,
            cacheProfile,
        } = window.AppCommon;

        attachPhoneFormatter(phoneInput);

        const setSubmitting = (isSubmitting) => {
            submitButton.disabled = isSubmitting;
            submitButton.textContent = isSubmitting ? 'Logowanie...' : 'Zaloguj';
        };

        const showError = (message) => {
            errorBox.textContent = message;
            errorBox.hidden = false;
        };

        const clearError = () => {
            errorBox.hidden = true;
            errorBox.textContent = '';
        };

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearError();

            if (!supabase) {
                showError('Konfiguracja Supabase jest wymagana przed zalogowaniem.');
                return;
            }

            if (!validatePhone(phoneInput.value)) {
                showError('Podaj pełny numer telefonu zapisany w bazie.');
                return;
            }

            const rawPassword = passwordInput.value;
            if (rawPassword.length < 6) {
                showError('Hasło musi mieć co najmniej 6 znaków.');
                return;
            }

            const normalizedPhone = normalizePhone(phoneInput.value);
            const authEmail = buildAuthEmail(normalizedPhone);

            setSubmitting(true);

            const { data, error } = await supabase.auth.signInWithPassword({
                email: authEmail,
                password: rawPassword,
            });

            if (error) {
                console.error(error);
                showError('Nieprawidłowy numer telefonu lub hasło.');
                setSubmitting(false);
                return;
            }

            const user = data?.user;
            if (!user) {
                showError('Brak danych użytkownika. Spróbuj ponownie.');
                setSubmitting(false);
                return;
            }

            let profile = await refreshProfile(user);
            if (!profile) {
                const { data: whitelist } = await supabase
                    .from('authorized_users')
                    .select('first_name, last_name, phone, can_post_messages')
                    .eq('phone', normalizedPhone)
                    .maybeSingle();
                profile = {
                    userId: user.id,
                    phone: normalizedPhone,
                    shiftCode: null,
                    ratownik: false,
                    dowodca: false,
                    kierowca: false,
                    nurek: false,
                    canManageCommandOrder: false,
                    firstName: whitelist?.first_name || '',
                    lastName: whitelist?.last_name || '',
                    canPostMessages: Boolean(whitelist?.can_post_messages),
                };
                cacheProfile(profile);
            }

            let shiftCodeFromDb = null;
            try {
                const { data: reg, error: regErr } = await supabase
                    .from('registered_users')
                    .select('shift_code')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (regErr) {
                    console.warn('registered_users odczyt shift_code - błąd:', regErr);
                } else {
                    shiftCodeFromDb = reg?.shift_code || null;
                }
            } catch (e) {
                console.warn('registered_users odczyt shift_code - wyjątek:', e);
            }

            window.location.href = 'home.html';
        });

        registerButton.addEventListener('click', () => {
            window.location.href = 'register.html';
        });
    });
})();
