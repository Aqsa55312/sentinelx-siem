import { useI18n, type Lang } from '../i18n';

const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'id', label: 'ID' },
];

type Props = {
  compact?: boolean;
};

export default function LanguageSwitch({ compact = false }: Props) {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      className={`lang-switch${compact ? ' compact' : ''}`}
      role="group"
      aria-label={t('language.label')}
    >
      {LANGS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={lang === item.id ? 'active' : ''}
          aria-pressed={lang === item.id}
          title={item.id === 'en' ? 'English' : 'Bahasa Indonesia'}
          onClick={() => setLang(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
