import React, { useState } from 'react';

export default function VideoGenerator({ messageIdFromUI, rawCodeBlock }) {
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState(null);

  const handleProcessTrigger = async () => {
    setProcessingStatus('submitting');

    try {
      // Step 1: Post identification values directly to your custom gateway proxy
      const initResponse = await fetch('/api/render-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageIdFromUI,
          code: rawCodeBlock
        })
      });

      if (!initResponse.ok) throw new Error("Job distribution failed.");
      
      setProcessingStatus('processing');

      // Step 2: Establish the polling loop targeting our intermediate gateway
      const statusTracker = setInterval(async () => {
        const checkResponse = await fetch(`/api/render-status/${messageIdFromUI}`);
        const trackingData = await checkResponse.json();

        if (trackingData.status === 'completed') {
          clearInterval(statusTracker);
          setGeneratedVideoUrl(trackingData.video_url);
          setProcessingStatus('completed');
          
          // Optional Step 3: Explicit client-driven database updates can be called safely here
          // if your backend relies on client confirmations.
          // await syncDatabaseRecord(messageIdFromUI, trackingData.video_url);
          
        } else if (trackingData.status === 'failed') {
          clearInterval(statusTracker);
          setProcessingStatus('failed');
          console.error("Pipeline failure description:", trackingData.error);
        }
      }, 3000);

    } catch (error) {
      setProcessingStatus('failed');
    }
  };

  return (
    <div>
      <button onClick={handleProcessTrigger}>Process Asset ID: {messageIdFromUI}</button>
      <p>Current Processing State: {processingStatus}</p>
      {processingStatus === 'completed' && (
        <video controls width="100%" src={generatedVideoUrl} />
      )}
    </div>
  );
}