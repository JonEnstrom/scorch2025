import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import './LongPressButton.css';

const LongPressButton = ({
  label,
  onLongPress,
  pressDuration = 1000  // in ms, default 1 second
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [progress, setProgress] = useState(0); // from 0 to 100

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  // Cleanup when unmounting
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
    };
  }, []);

  const handlePressStart = () => {
    setIsPressed(true);
    setProgress(0);
    startTimeRef.current = Date.now();

    // Update progress in intervals
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const percentage = Math.min((elapsed / pressDuration) * 100, 100);
      setProgress(percentage);

      if (elapsed >= pressDuration) {
        // Once we've reached the required press duration,
        // we call onLongPress and stop everything.
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsPressed(false);
        setProgress(0);
        onLongPress();
      }
    }, 50); // update every 50ms for smoother progress
  };

  const handlePressEnd = () => {
    setIsPressed(false);
    setProgress(0);
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  return (
    <button
      className="long-press-button"
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
    >
      {label}
      {/* Visual indicator of progress */}
      {isPressed && (
        <div className="LPprogress-bar">
          <div className="LPprogress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
};

LongPressButton.propTypes = {
  label: PropTypes.string.isRequired,
  onLongPress: PropTypes.func.isRequired,
  pressDuration: PropTypes.number // in ms
};

export default LongPressButton;
