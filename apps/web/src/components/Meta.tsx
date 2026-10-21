type Props = {
  label: string;
  value: React.ReactNode;
};

export default function Meta({ label, value }: Props) {
  return (
    <div className="meta-cell">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  );
}
