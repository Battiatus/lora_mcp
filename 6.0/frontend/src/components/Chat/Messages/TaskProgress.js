import React from 'react';

function TaskProgress({ progress }) {
  const { status, step, totalSteps, message } = progress;
  
  // Calculate progress percentage
  let progressPercent;
  if (status === 'completed') {
    progressPercent = 100;
  } else if (status === 'started') {
    progressPercent = 0;
  } else {
    // in-progress - estimate based on step (assuming max 20 steps)
    progressPercent = Math.min((step / 20) * 100, 95);
  }

  return (
    <div className="task-progress">
      <div className="progress-header">
        <div className="progress-title">Task Execution</div>
        <div className="progress-steps">
          Step <span className="current-step-num">{step}</span> of{' '}
          <span className="total-steps">{totalSteps || '?'}</span>
        </div>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>
      <div className="current-step">{message}</div>
    </div>
  );
}

export default TaskProgress;