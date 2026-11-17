/* ===================== CONFIGURAÇÃO ===================== */
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1900;
let currentLang = 'pt';

// Letras de qualquer alfabeto (inclui acentos: à, ç, ñ, ü...), com espaço simples entre palavras
const NAME_REGEX  = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;
// texto válido @ domínio . extensão (aceita subdomínios, ex.: nome@avev.ul.pt)
const EMAIL_REGEX = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
// Número português: 9 dígitos, começa por 9 ou 2
const PHONE_REGEX = /^[29]\d{8}$/;

// Anti-spam: tempo mínimo (em segundos) entre abrir o formulário e enviá-lo
const MIN_FILL_SECONDS = 4;
let formOpenedAt = null;   // momento em que o formulário foi aberto
let isSubmitting = false;  // impede envios duplicados

// Idade mínima por role (chave = value enviado ao Salesforce)
const ROLE_MIN_AGE = {
  Athlete:   5,
  Volunteer: 16,
  Coach:     18,
  Staff:     18
};

// Abaixo desta idade (calculada na data de hoje) pedem-se os dados do encarregado de educação
const GUARDIAN_AGE_LIMIT = 18;

// Roles em que um menor precisa de encarregado de educação.
// Voluntários menores (16-17 anos) NÃO precisam. Treinador e Staff são sempre 18+.
const GUARDIAN_REQUIRED_ROLES = ['Athlete'];

// Início da época 2026/27
const SEASON_START = new Date(2026, 8, 1); // 1 Set 2026 (o mês começa em 0)

// Antes de 1 Set 2026 -> a idade mínima por role é calculada no início da época
// A partir de 1 Set 2026 -> é calculada na data de hoje
const TODAY = new Date();
const AGE_REFERENCE_DATE = (TODAY < SEASON_START) ? SEASON_START : TODAY;

// Nome dos roles usado nas mensagens de erro de idade
const ROLE_LABELS = {
  pt: { Athlete: 'Atleta',      Coach: 'Treinador', Staff: 'Staff', Volunteer: 'Voluntário' },
  en: { Athlete: 'an Athlete',  Coach: 'a Coach',   Staff: 'Staff', Volunteer: 'a Volunteer' }
};

// Formato das datas que o Salesforce espera (Birthdate e Accepted Policy Date).
// Depende do Locale do "Default Lead Creator":
//   Portugal (pt_PT) / Reino Unido (en_GB) -> 'dd/MM/yyyy'
//   EUA (en_US)                            -> 'MM/dd/yyyy'
const SF_DATE_FORMAT = 'dd/MM/yyyy';

/* ===================== MENSAGENS ===================== */
const MSG = {
  pt: {
    required:     'Este campo é obrigatório.',
    name:         'Só são permitidas letras (incluindo letras com acento).',
    select:       'Seleciona uma opção.',
    day:          'Dia inválido: tem de estar entre 01 e 31.',
    month:        'Mês inválido: tem de estar entre 01 e 12.',
    year:         'Ano inválido: tem de estar entre ' + MIN_YEAR + ' e ' + CURRENT_YEAR + '.',
    dateRequired: 'Preenche o dia, o mês e o ano.',
    dateInvalid:  'Esta data não existe (ex.: 31/02).',
    dateFuture:   'A data de nascimento não pode ser no futuro.',
    email:        'Email inválido. Exemplo: nome@dominio.pt',
    phone:        'Número inválido: tem de ter 9 dígitos e começar por 9 ou 2.',
    consent:      'Tens de aceitar a Política de Privacidade para continuar.',
    tooFast:      'Por segurança, aguarda uns segundos e carrega novamente em Enviar.'
  },
  en: {
    required:     'This field is required.',
    name:         'Only letters are allowed (accented letters included).',
    select:       'Please select an option.',
    day:          'Invalid day: must be between 01 and 31.',
    month:        'Invalid month: must be between 01 and 12.',
    year:         'Invalid year: must be between ' + MIN_YEAR + ' and ' + CURRENT_YEAR + '.',
    dateRequired: 'Please fill in day, month and year.',
    dateInvalid:  'This date does not exist (e.g. 31/02).',
    dateFuture:   'Birthdate cannot be in the future.',
    email:        'Invalid email. Example: name@domain.com',
    phone:        'Invalid number: must have 9 digits and start with 9 or 2.',
    consent:      'You must accept the Privacy Policy to continue.',
    tooFast:      'For security reasons, please wait a few seconds and click Submit again.'
  }
};

// Mensagens de idade mínima (geradas a partir de ROLE_MIN_AGE), ex.: MSG.pt.age_Coach
// Antes do início da época, a mensagem indica a data a que a idade é verificada
const AGE_AT_SEASON_START = (AGE_REFERENCE_DATE === SEASON_START);
Object.keys(ROLE_MIN_AGE).forEach(role => {
  const min    = ROLE_MIN_AGE[role];
  const whenPT = AGE_AT_SEASON_START ? ' a 1 de setembro de 2026' : '';
  const whenEN = AGE_AT_SEASON_START ? ' on 1 September 2026' : '';
  MSG.pt['age_' + role] = 'Para te registares como ' + ROLE_LABELS.pt[role] +
                          ' tens de ter pelo menos ' + min + ' anos' + whenPT + '.';
  MSG.en['age_' + role] = 'You must be at least ' + min + ' years old' + whenEN +
                          ' to register as ' + ROLE_LABELS.en[role] + '.';
});

/* ===================== ELEMENTOS DA PÁGINA ===================== */
const leadForm        = document.getElementById('leadForm');
const dayEl           = document.getElementById('birth_day');
const monthEl         = document.getElementById('birth_month');
const yearEl          = document.getElementById('birth_year');
const phoneEl         = document.getElementById('phone');
const consentEl       = document.getElementById('consent');
const submitBtn       = document.getElementById('submitBtn');
const honeypotEl      = document.getElementById('website');
const consentAdult    = document.getElementById('consentAdult');
const consentMinor    = document.getElementById('consentMinor');
const privacyDialog   = document.getElementById('privacyDialog');

// Encarregado de educação (campos visíveis, sem "name": nunca são enviados diretamente)
const guardianSection       = document.getElementById('guardianSection');
const guardianNameEl        = document.getElementById('guardianName');
const guardianEmailEl       = document.getElementById('guardianEmail');
const guardianInputs        = [guardianNameEl, guardianEmailEl];
const guardianHintLocked    = document.getElementById('guardianHintLocked');
const guardianHintRequired  = document.getElementById('guardianHintRequired');
const guardianRequiredMarks = guardianSection.querySelectorAll('.guardian-required');

// Campos escondidos enviados ao Salesforce (preenchidos só no momento do envio)
const birthdateSf     = document.getElementById('birthdate_sf');
const policyDateSf    = document.getElementById('acceptedPolicyDate_sf');
const guardianNameSf  = document.getElementById('guardianName_sf');
const guardianEmailSf = document.getElementById('guardianEmail_sf');

/* ===================== GESTÃO DE ERROS ===================== */
const errorState = {}; // campo -> chave da mensagem

function renderError(field) {
  const el = document.getElementById('err_' + field);
  const key = errorState[field];
  el.textContent = key ? MSG[currentLang][key] : '';
  el.classList.toggle('visible', !!key);
}
function setError(field, key) { errorState[field] = key; renderError(field); }
function clearError(field)    { delete errorState[field]; renderError(field); }

function markInvalid(input, isInvalid) {
  input.classList.toggle('invalid', isInvalid);
  input.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
}

// Aplica o resultado de uma validação: marca inputs e mostra/esconde a mensagem
function applyResult(field, inputs, key) {
  inputs.forEach(i => markInvalid(i, !!key));
  key ? setError(field, key) : clearError(field);
  return !key;
}

/* ===================== VALIDADORES ===================== */
function validateName(field, required) {
  const input = document.getElementById(field);
  input.value = input.value.normalize('NFC').trim();
  const v = input.value;
  let key = null;
  if (!v) { if (required) key = 'required'; }
  else if (!NAME_REGEX.test(v)) key = 'name';
  return applyResult(field, [input], key);
}

function validateSelect(base) {
  const select = document.getElementById(base + '_' + currentLang);
  return applyResult(base, [select], select.value ? null : 'select');
}

// Serve para o email principal e para o email do encarregado de educação
function validateEmail(field) {
  const input = document.getElementById(field);
  input.value = input.value.trim();
  const v = input.value;
  let key = null;
  if (!v) key = 'required';
  else if (!EMAIL_REGEX.test(v)) key = 'email';
  return applyResult(field, [input], key);
}

function validatePhone() {
  const v = phoneEl.value;
  // Opcional: só valida se estiver preenchido
  return applyResult('phone', [phoneEl], (v && !PHONE_REGEX.test(v)) ? 'phone' : null);
}

function validateConsent() {
  return applyResult('consent', [consentEl], consentEl.checked ? null : 'consent');
}

// final = true no envio (campos vazios dão erro); false durante o preenchimento
function validateBirthdate(final) {
  const inputs = [dayEl, monthEl, yearEl];
  const d = dayEl.value, m = monthEl.value, y = yearEl.value;
  let key = null, bad = [];

  if (d && (+d < 1 || +d > 31)) {
    key = 'day'; bad = [dayEl];
  } else if (m && (+m < 1 || +m > 12)) {
    key = 'month'; bad = [monthEl];
  } else if (y && (y.length < 4 || +y < MIN_YEAR || +y > CURRENT_YEAR)) {
    key = 'year'; bad = [yearEl];
  } else if (!d || !m || !y) {
    if (final) { key = 'dateRequired'; bad = inputs.filter(i => !i.value); }
  } else {
    const date = new Date(+y, +m - 1, +d);
    if (date.getDate() !== +d || date.getMonth() !== +m - 1) {
      key = 'dateInvalid'; bad = [dayEl, monthEl];
    } else if (date > new Date()) {
      key = 'dateFuture'; bad = inputs;
    }
  }

  inputs.forEach(i => markInvalid(i, bad.includes(i)));
  key ? setError('birthdate', key) : clearError('birthdate');
  return !key;
}

/* ===================== DATAS E IDADE ===================== */
// Devolve a data de nascimento como Date, ou null se estiver incompleta ou inválida
function getBirthDate() {
  const d = dayEl.value, m = monthEl.value, y = yearEl.value;
  if (!d || !m || y.length !== 4) return null;
  const date = new Date(+y, +m - 1, +d);
  if (date.getDate() !== +d || date.getMonth() !== +m - 1) return null;
  if (+y < MIN_YEAR || date > new Date()) return null;
  return date;
}

// Formata uma data no formato que o Salesforce espera
function formatSfDate(d, m, y) {
  return SF_DATE_FORMAT
    .replace('dd', String(d).padStart(2, '0'))
    .replace('MM', String(m).padStart(2, '0'))
    .replace('yyyy', String(y));
}

// Birthdate (ex.: 05/03/1998)
function buildSfBirthdate() {
  return formatSfDate(dayEl.value, monthEl.value, yearEl.value);
}

// Accepted Policy Date = data de hoje (momento do envio)
function buildSfToday() {
  const t = new Date();
  return formatSfDate(t.getDate(), t.getMonth() + 1, t.getFullYear());
}

// Idade em anos completos numa data de referência
function calculateAge(birth, ref) {
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function hasAgeError() {
  return !!errorState.birthdate && errorState.birthdate.startsWith('age_');
}

function getSelectedRole() {
  return document.getElementById('interestedRole_' + currentLang).value;
}

// Verifica se a idade cumpre o mínimo do role escolhido
function validateAge() {
  const role  = getSelectedRole();
  const birth = getBirthDate();

  // Sem role ou sem data válida: não há nada para verificar
  if (!role || !(role in ROLE_MIN_AGE) || !birth) return true;

  const dateInputs = [dayEl, monthEl, yearEl];
  const age = calculateAge(birth, AGE_REFERENCE_DATE);

  if (age >= ROLE_MIN_AGE[role]) {
    if (hasAgeError()) {
      dateInputs.forEach(i => markInvalid(i, false));
      clearError('birthdate');
    }
    return true;
  }

  dateInputs.forEach(i => markInvalid(i, true));
  setError('birthdate', 'age_' + role);
  return false;
}

/* ===================== ENCARREGADO DE EDUCAÇÃO ===================== */
let guardianUnlocked = false;   // estado atual da secção (false = bloqueada)

// Menor = idade na data de hoje inferior a GUARDIAN_AGE_LIMIT (só com data válida)
function isMinor() {
  const birth = getBirthDate();
  return !!birth && calculateAge(birth, new Date()) < GUARDIAN_AGE_LIMIT;
}

// Encarregado obrigatório: data válida + menor de 18 + role Atleta (ou role ainda por escolher).
// Se o role escolhido não estiver em GUARDIAN_REQUIRED_ROLES (ex.: Voluntário), fica bloqueado.
function isGuardianRequired() {
  if (!isMinor()) return false;
  const role = getSelectedRole();
  return role === '' || GUARDIAN_REQUIRED_ROLES.includes(role);
}

// Bloqueia/desbloqueia os campos do encarregado.
// IMPORTANTE: ao bloquear, os valores escritos NÃO são apagados.
function updateGuardianSection() {
  const required = isGuardianRequired();
  const changed  = (required !== guardianUnlocked);
  guardianUnlocked = required;

  guardianSection.classList.toggle('is-locked', !required);
  guardianHintLocked.hidden   = required;
  guardianHintRequired.hidden = !required;
  guardianRequiredMarks.forEach(m => m.hidden = !required);

  guardianInputs.forEach(i => {
    i.disabled = !required;      // bloqueia, mas mantém o valor
    i.required = required;
    i.setAttribute('aria-required', required ? 'true' : 'false');
    if (!required) markInvalid(i, false);
  });
  if (!required) {
    clearError('guardianName');
    clearError('guardianEmail');
  }

  // Texto do consentimento: próprio ou do encarregado
  consentAdult.hidden = required;
  consentMinor.hidden = !required;

  // Se o texto do consentimento mudou, a caixa tem de ser marcada de novo
  if (changed) consentEl.checked = false;
}

function validateGuardian() {
  if (!guardianUnlocked) return true;
  const nameOk  = validateName('guardianName', true);
  const emailOk = validateEmail('guardianEmail');
  return nameOk && emailOk;
}

// Copia os dados do encarregado para os campos escondidos enviados ao Salesforce.
// Se a secção estiver bloqueada, envia-os EM BRANCO (mesmo que haja texto nas caixas).
function fillGuardianHiddenFields() {
  guardianNameSf.value  = guardianUnlocked ? guardianNameEl.value  : '';
  guardianEmailSf.value = guardianUnlocked ? guardianEmailEl.value : '';
}

// Revalida a data; se havia um erro de idade, volta a verificar a idade; atualiza a secção do encarregado
function revalidateBirthdate() {
  const hadAgeError = hasAgeError();
  if (validateBirthdate(false) && hadAgeError) validateAge();
  updateGuardianSection();
}

/* ===================== FILTROS EM TEMPO REAL ===================== */
function digitsOnly(input) {
  const cleaned = input.value.replace(/\D/g, '');
  if (cleaned !== input.value) input.value = cleaned;
}

// Nomes: remove tudo o que não seja letra ou espaço simples
['firstName', 'lastName', 'guardianName'].forEach(field => {
  const input = document.getElementById(field);
  input.addEventListener('input', () => {
    const cleaned = input.value.normalize('NFC')
      .replace(/[^\p{L}\p{M} ]/gu, '')  // só letras (com acentos) e espaços
      .replace(/^ +/, '')               // sem espaço no início
      .replace(/ {2,}/g, ' ');          // sem espaços duplos
    if (cleaned !== input.value) {
      input.value = cleaned;
      markInvalid(input, true);
      setError(field, 'name');
    } else if (errorState[field] === 'name') {
      markInvalid(input, false);
      clearError(field);
    }
  });
  // O Nome (firstName) é o único opcional
  input.addEventListener('blur', () => validateName(field, field !== 'firstName'));
});

// Dia / Mês: bloqueia valores impossíveis (ex.: 44 no dia, 13 no mês)
function setupDatePart(input, max, key, next) {
  input.addEventListener('input', () => {
    digitsOnly(input);
    if (input.value.length === 2) {
      const n = +input.value;
      if (n < 1 || n > max) {
        input.value = input.value.charAt(0);   // rejeita o segundo dígito
        markInvalid(input, true);
        setError('birthdate', key);
        return;
      }
      markInvalid(input, false);
      if (errorState.birthdate === key) clearError('birthdate');
      next.focus();                             // salta para o campo seguinte
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.length === 1 && input.value !== '0') input.value = '0' + input.value;
    revalidateBirthdate();
  });
}
setupDatePart(dayEl, 31, 'day', monthEl);
setupDatePart(monthEl, 12, 'month', yearEl);

// Ano: só dígitos; valida quando tem 4 dígitos ou ao sair do campo
yearEl.addEventListener('input', () => {
  digitsOnly(yearEl);
  if (yearEl.value.length === 4) revalidateBirthdate();
});
yearEl.addEventListener('blur', revalidateBirthdate);

// Sempre que a data fica completa e válida (ex.: muda de 15 para 20 anos), atualiza logo o encarregado
[dayEl, monthEl, yearEl].forEach(el => {
  el.addEventListener('input', () => { if (getBirthDate()) updateGuardianSection(); });
});

// Emails: validam ao sair; se já tiverem erro, revalidam enquanto se corrige
['email', 'guardianEmail'].forEach(field => {
  const input = document.getElementById(field);
  input.addEventListener('blur', () => validateEmail(field));
  input.addEventListener('input', () => { if (errorState[field]) validateEmail(field); });
});

// Telefone: só dígitos, máx. 9; remove o indicativo +351 se for colado
phoneEl.addEventListener('input', () => {
  let digits = phoneEl.value.replace(/\D/g, '');
  if (digits.startsWith('351') && digits.length > 9) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  if (digits !== phoneEl.value) phoneEl.value = digits;

  if (digits && !/^[29]/.test(digits)) {        // primeiro dígito errado: avisa já
    applyResult('phone', [phoneEl], 'phone');
  } else if (digits.length === 9 || errorState.phone) {
    validatePhone();
  }
});
phoneEl.addEventListener('blur', validatePhone);

// Picklists: valida ao escolher; ao mudar o role, verifica a idade e atualiza o encarregado
['gender', 'interestedRole'].forEach(base => {
  ['pt', 'en'].forEach(lang => {
    document.getElementById(base + '_' + lang).addEventListener('change', () => {
      validateSelect(base);
      if (base === 'interestedRole') {
        if (hasAgeError()) validateAge();
        updateGuardianSection();
      }
    });
  });
});

// Consentimento: valida ao marcar/desmarcar
consentEl.addEventListener('change', validateConsent);

/* ===================== UI ===================== */
// Abre o formulário e faz scroll até ele (usado pelo menu e pelo botão do Sobre Nós)
function openInterestForm() {
  const section = document.getElementById('interestForm');
  section.style.display = 'block';
  if (!formOpenedAt) formOpenedAt = Date.now();   // começa a contar o tempo de preenchimento
  window.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
}

// Abre/fecha o formulário (usado pelo menu)
function toggleInterestForm() {
  const section = document.getElementById('interestForm');
  if (section.style.display === 'block') {
    section.style.display = 'none';
  } else {
    openInterestForm();
  }
}

function switchLanguage(lang) {
  const isPT = (lang === 'pt');

  // Passar a opção escolhida (e o estado de erro) para a picklist da nova língua
  ['gender', 'interestedRole'].forEach(base => {
    const from = document.getElementById(base + '_' + currentLang);
    const to   = document.getElementById(base + '_' + lang);
    if (from !== to) {
      to.selectedIndex = from.selectedIndex;   // as opções estão pela mesma ordem
      markInvalid(to, from.classList.contains('invalid'));
      markInvalid(from, false);
    }
  });

  currentLang = lang;

  // Mostrar/esconder textos, picklists e Política de Privacidade de cada idioma
  document.querySelectorAll('.lang-pt').forEach(e => e.style.display = isPT ? '' : 'none');
  document.querySelectorAll('.lang-en').forEach(e => e.style.display = isPT ? 'none' : '');

  // Desativar as picklists do idioma inativo (não validam nem são enviadas)
  document.querySelectorAll('select.pt-only').forEach(s => s.disabled = !isPT);
  document.querySelectorAll('select.en-only').forEach(s => s.disabled = isPT);

  // Ligar as labels à picklist visível
  document.querySelectorAll('label[data-base]').forEach(l => {
    l.htmlFor = l.dataset.base + '_' + lang;
  });

  // Placeholder do ano
  yearEl.placeholder = isPT ? 'aaaa' : 'yyyy';

  // Texto alternativo das imagens
  document.querySelectorAll('img[data-alt-pt]').forEach(img => {
    img.alt = isPT ? img.dataset.altPt : img.dataset.altEn;
  });

  // Traduzir as mensagens de erro visíveis
  Object.keys(errorState).forEach(renderError);

  // Botões do seletor de idioma
  document.getElementById('ptBtn').classList.toggle('active', isPT);
  document.getElementById('enBtn').classList.toggle('active', !isPT);

  document.documentElement.lang = isPT ? 'pt-PT' : 'en';
}

/* ===================== POLÍTICA DE PRIVACIDADE ===================== */
function openPrivacyPolicy(e) {
  if (e) e.preventDefault();   // não segue o link nem marca a checkbox
  if (typeof privacyDialog.showModal === 'function') {
    privacyDialog.showModal();
  } else {
    privacyDialog.setAttribute('open', '');   // browsers muito antigos
  }
}

function closePrivacyPolicy() {
  if (typeof privacyDialog.close === 'function') {
    privacyDialog.close();
  } else {
    privacyDialog.removeAttribute('open');
  }
}

document.querySelectorAll('.privacy-link').forEach(link => {
  link.addEventListener('click', openPrivacyPolicy);
});

// Fechar ao clicar fora da janela (no fundo escurecido)
privacyDialog.addEventListener('click', e => {
  if (e.target === privacyDialog) closePrivacyPolicy();
});

/* ===================== ENVIO ===================== */
// Ativa/desativa o estado "a enviar" do botão
function setSubmitting(state) {
  isSubmitting = state;
  submitBtn.disabled = state;
  submitBtn.classList.toggle('is-sending', state);
}

leadForm.addEventListener('submit', function (e) {
  // Bloquear duplo clique / Enter repetido
  if (isSubmitting) {
    e.preventDefault();
    return;
  }

  // Honeypot: se o campo invisível vier preenchido, é um bot.
  // Finge que correu bem: vai para a página de agradecimento sem enviar nada ao Salesforce.
  if (honeypotEl.value !== '') {
    e.preventDefault();
    window.location.href = leadForm.querySelector('input[name="retURL"]').value;
    return;
  }

  // Limpa sempre os campos escondidos antes de validar
  birthdateSf.value     = '';
  policyDateSf.value    = '';
  guardianNameSf.value  = '';
  guardianEmailSf.value = '';

  const firstNameOk = validateName('firstName', false);
  const lastNameOk  = validateName('lastName', true);
  const genderOk    = validateSelect('gender');
  const birthdateOk = validateBirthdate(true);
  const emailOk     = validateEmail('email');
  const phoneOk     = validatePhone();
  const roleOk      = validateSelect('interestedRole');

  // Atualiza o estado do encarregado conforme a data e o role finais
  updateGuardianSection();
  const guardianOk  = validateGuardian();
  const consentOk   = validateConsent();

  // Idade mínima por role: só se verifica quando a data e o role são válidos
  const ageOk = (birthdateOk && roleOk) ? validateAge() : true;

  const allOk = firstNameOk && lastNameOk && genderOk && birthdateOk && emailOk &&
                phoneOk && roleOk && ageOk && guardianOk && consentOk;

  if (!allOk) {
    e.preventDefault();
    // Foca o primeiro campo com erro
    const firstInvalid = this.querySelector('.invalid');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  // Anti-spam: tempo mínimo de preenchimento
  const elapsedSeconds = formOpenedAt ? (Date.now() - formOpenedAt) / 1000 : 0;
  if (elapsedSeconds < MIN_FILL_SECONDS) {
    e.preventDefault();
    setError('submit', 'tooFast');
    return;
  }
  clearError('submit');

  // Tudo válido: preenche os campos escondidos e bloqueia o botão
  birthdateSf.value  = buildSfBirthdate();
  policyDateSf.value = buildSfToday();   // Accepted Policy Date = data do envio
  fillGuardianHiddenFields();            // em branco se a secção estiver bloqueada
  setSubmitting(true);
});

// Se a pessoa voltar atrás no browser (ex.: a partir da página de agradecimento), reativa o botão
window.addEventListener('pageshow', e => {
  if (e.persisted) setSubmitting(false);
});

window.onload = function () {
  switchLanguage('pt');      // idioma padrão PT
  updateGuardianSection();   // estado inicial: bloqueado
};