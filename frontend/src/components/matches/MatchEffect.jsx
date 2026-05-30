import { motion } from 'framer-motion';
import { useAuth } from '../../context/useAuth';
import './MatchEffect.css';

export default function MatchEffect({ item, onDismiss }) {
  const { user } = useAuth();
  const partnerLabel = (user?.partnerName || '').trim().toLowerCase() || 'your person';

  return (
    <motion.div
      className="match-effect-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      onClick={onDismiss}
    >
      <div className="match-effect-diagram">
        <div className="match-effect-labels">
          <motion.span
            className="match-effect-party match-effect-party-left"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38, duration: 0.32 }}
          >
            you
          </motion.span>
          <motion.span
            className="match-effect-party match-effect-party-right"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.46, duration: 0.32 }}
          >
            {partnerLabel}
          </motion.span>
        </div>

        <div className="match-effect-row">
          <motion.div
            className="match-effect-circle match-effect-circle-left"
            initial={{ x: '-200%' }}
            animate={{ x: 0 }}
            transition={{ delay: 0.16, duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="match-effect-circle match-effect-circle-right"
            initial={{ x: '200%' }}
            animate={{ x: 0 }}
            transition={{ delay: 0.16, duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
          />

          <motion.div
            className="match-effect-lens"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.span
              className="match-effect-emoji"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.7, type: 'spring', stiffness: 200, damping: 12 }}
            >
              {item.emoji}
            </motion.span>
          </motion.div>
        </div>
      </div>

      <motion.div
        className="match-effect-content"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.82, type: 'spring', stiffness: 150, damping: 16 }}
      >
        <p className="match-effect-kicker">your overlap</p>
        <h3 className="match-effect-title serif">{item.title}</h3>
      </motion.div>
    </motion.div>
  );
}
