import { riskTone } from '../lib/format';
import { useI18n } from '../i18n';

type Props = {
  score: number;
};

/**
 * Segmented risk gauge shared by alert and incident detail views.
 * The score is a prototype heuristic, never a compromise probability.
 */
export default function RiskMeter({ score }: Props) {
  const { t, riskLabel } = useI18n();
  const tone = riskTone(score);

  return (
    <div
      className={`risk-meter ${tone}`}
      role="progressbar"
      aria-label={t('risk.score')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
    >
      <div className="risk-meter-top">
        <span className="risk-value">{score}</span>
        <span className="risk-denom">/100</span>
        <span className="risk-label">{riskLabel(tone)}</span>
      </div>
      <div className="risk-track">
        <div className={`risk-fill ${tone}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
      <div className="risk-scale">
        <span>{t('risk.scaleLow')}</span>
        <span>{t('risk.scaleMid')}</span>
        <span>{t('risk.scaleHigh')}</span>
      </div>
    </div>
  );
}
