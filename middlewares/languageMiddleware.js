const SUPPORTED_LANGUAGES = ['en', 'te', 'hi', 'mr'];

export const languageMiddleware = (req, res, next) => {
  let lang = null;

  // 1. Check query parameters (?lang=te or ?lng=te or ?locale=te)
  if (req.query.lang) {
    lang = req.query.lang.toLowerCase();
  } else if (req.query.lng) {
    lang = req.query.lng.toLowerCase();
  } else if (req.query.locale) {
    lang = req.query.locale.toLowerCase();
  }

  // 2. Check Accept-Language header
  if (!lang && req.headers['accept-language']) {
    const acceptLangs = req.headers['accept-language']
      .split(',')
      .map(part => {
        const [langCode] = part.split(';');
        return langCode.trim().split('-')[0].toLowerCase();
      });

    lang = acceptLangs.find(l => SUPPORTED_LANGUAGES.includes(l));
  }

  // 3. Fallback to default
  const resolvedLanguage = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';

  req.language = resolvedLanguage;
  req.isTranslated = resolvedLanguage !== 'en';

  next();
};

export default languageMiddleware;
