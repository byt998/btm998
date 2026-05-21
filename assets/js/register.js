// =========================================================
// Plik: assets/js/register.js
// Spis treści logiki:
// 1. Sprawdzenie uprawnionego numeru
// 2. Rejestracja użytkownika w Supabase Auth
// 3. Zapis danych w tabeli registered_users
// =========================================================

(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('register-form');
        const phoneInput = document.getElementById('register-phone');
        const shiftSelect = document.getElementById('register-shift');
        const passwordInput = document.getElementById('register-password');
        const confirmInput = document.getElementById('register-password-confirm');
        const ratownikInput = document.getElementById('register-ratownik');
        const dowodcaInput = document.getElementById('register-dowodca');
        const kierowcaInput = document.getElementById('register-kierowca');
        const nurekInput = document.getElementById('register-nurek');
        const errorBox = form.querySelector('.form-error');
        const loginButton = form.querySelector('[data-action="go-login"]');
        const submitButton = form.querySelector('button[type="submit"]');

        const {
            supabase,
            attachPhoneFormatter,
            validatePhone,
            normalizePhone,
            buildAuthEmail,
            cacheProfile,
        } = window.AppCommon;

        attachPhoneFormatter(phoneInput);

        const setSubmitting = (isSubmitting) => {
            submitButton.disabled = isSubmitting;
            submitButton.textContent = isSubmitting ? 'Rejestrowanie...' : 'Utwórz konto';
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
                showError('Konfiguracja Supabase jest wymagana przed rejestracją.');
                return;
            }

            if (!validatePhone(phoneInput.value)) {
                showError('Numer telefonu musi odpowiadać wpisowi w bazie uprawnionych użytkowników.');
                return;
            }

            if (!shiftSelect.value) {
                showError('Wybierz zmianę, aby kontynuować.');
                return;
            }

            const rawPassword = passwordInput.value;
            const confirmPassword = confirmInput.value;

            if (rawPassword.length < 6) {
                showError('Hasło musi mieć co najmniej 6 znaków.');
                return;
            }

            if (rawPassword !== confirmPassword) {
                showError('Hasła muszą być identyczne.');
                return;
            }

            const normalizedPhone = normalizePhone(phoneInput.value);

            setSubmitting(true);

            const { data: whitelist, error: whitelistError } = await supabase
                .from('authorized_users')
                .select('first_name, last_name, phone, can_post_messages')
                .eq('phone', normalizedPhone)
                .maybeSingle();

            if (whitelistError) {
                console.error(whitelistError);
                showError('Nie udało się zweryfikować numeru. Spróbuj ponownie.');
                setSubmitting(false);
                return;
            }

            if (!whitelist) {
                showError('Numer telefonu nie jest na liście uprawnionych. Skontaktuj się z administratorem.');
                setSubmitting(false);
                return;
            }

            const authEmail = buildAuthEmail(normalizedPhone);
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: authEmail,
                password: rawPassword,
            });

            if (signUpError) {
                console.error(signUpError);
                setSubmitting(false);
                if (signUpError.message?.includes('already registered')) {
                    showError('Hasło do tego konta zostało już ustawione. Użyj opcji logowania.');
                } else {
                    showError('Nie udało się utworzyć konta. Sprawdź konfigurację e-mail w Supabase (wyłącz potwierdzanie).');
                }
                return;
            }

            const user = signUpData?.user;
            const session = signUpData?.session;

            if (!user || !session) {
                showError('Konto utworzone, ale wymaga potwierdzenia e-mail. Wyłącz potwierdzanie lub aktywuj konto ręcznie.');
                setSubmitting(false);
                return;
            }

            const { error: insertError } = await supabase
                .from('registered_users')
                .insert({
                    user_id: user.id,
                    phone: normalizedPhone,
                    shift_code: shiftSelect.value,
                    ratownik: ratownikInput?.value === 'true',
                    dowodca: dowodcaInput?.value === 'true',
                    kierowca: kierowcaInput?.value === 'true',
                    nurek: nurekInput?.value === 'true',
                });

            if (insertError) {
                console.error(insertError);
                showError('Nie udało się zapisać danych profilu. Spróbuj ponownie.');
                setSubmitting(false);
                return;
            }

            cacheProfile({
                userId: user.id,
                phone: normalizedPhone,
                shiftCode: shiftSelect.value,
                ratownik: ratownikInput?.value === 'true',
                dowodca: dowodcaInput?.value === 'true',
                kierowca: kierowcaInput?.value === 'true',
                nurek: nurekInput?.value === 'true',
                canManageCommandOrder: false,
                firstName: whitelist.first_name,
                lastName: whitelist.last_name,
                canPostMessages: Boolean(whitelist.can_post_messages),
            });

            window.location.href = 'home.html';
        });

        loginButton.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    });
})();
