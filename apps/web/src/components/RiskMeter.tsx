import { riskLabel, riskTone } from '../lib/format';

type Props = {
  score: number;
};

/**
 * Segmented risk gauge shared by alert and incident detail views.
 * The score is a prototype heuristic, never a compromise probability.
 */
export default function RiskMeter({ score }: Props) {
  const tone = riskTone(score);

  return (
    <div
      className={`risk-meter ${tone}`}
      role="progressbar"
      aria-label="Risk score"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
    >
      <div className="risk-meter-top">
        <span className="risk-value">{score}</span>
        <span className="risk-denom">/100</span>
        <span className="risk-label">{riskLabel(score)}</span>
      </div>
      <div className="risk-track">
        <div className={`risk-fill ${tone}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
      <div className="risk-scale">
        <span>0 · info</span>
        <span>50 · medium</span>
        <span>100 · critical</span>
      </div>
    </div>
  );
}
