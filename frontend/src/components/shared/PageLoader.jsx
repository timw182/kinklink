import AnimatedKnot from './AnimatedKnot';
import './PageLoader.css';

/** Centered brand loader. `full` fills the viewport (route fallback); otherwise fills its parent. */
export default function PageLoader({ full = false, label }) {
  return (
    <div className={full ? 'page-loader page-loader-full' : 'page-loader'}>
      <AnimatedKnot size={64} />
      {label && <p className="page-loader-label text-muted">{label}</p>}
    </div>
  );
}
