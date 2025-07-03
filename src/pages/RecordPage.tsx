import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const RecordPage: React.FC = () => {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<'audio' | 'video'>('audio');
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      // Configuration des contraintes média selon le mode
      const constraints = recordingMode === 'video' 
        ? { 
            audio: true, 
            video: { 
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            } 
          }
        : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      
      // Afficher la vidéo en temps réel si mode vidéo
      if (recordingMode === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsVideoEnabled(true);
      }

      // Configuration du MediaRecorder selon le mode
      const mimeType = recordingMode === 'video' 
        ? 'video/webm;codecs=vp9,opus' 
        : 'audio/webm;codecs=opus';
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined
      });
      
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { 
          type: recordingMode === 'video' ? 'video/webm' : 'audio/webm' 
        });
        setRecordedBlob(blob);
        
        // Arrêter l'affichage vidéo
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setIsVideoEnabled(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Erreur lors du démarrage de l\'enregistrement:', error);
      
      let errorMessage = 'Impossible d\'accéder aux médias.';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Accès refusé. Veuillez autoriser l\'accès au microphone' + 
            (recordingMode === 'video' ? ' et à la caméra' : '') + '.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'Aucun dispositif ' + 
            (recordingMode === 'video' ? 'audio/vidéo' : 'audio') + ' trouvé.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Dispositif déjà utilisé par une autre application.';
        }
      }
      
      alert(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  };

  const downloadRecording = () => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      const extension = recordingMode === 'video' ? 'webm' : 'webm';
      const prefix = recordingMode === 'video' ? 'video' : 'audio';
      a.download = `${prefix}-${new Date().toISOString().slice(0, 19)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Enregistrement {recordingMode === 'video' ? 'Vidéo' : 'Audio'}
            </h1>
            <p className="text-gray-600">
              Bonjour {user?.name}, prêt à enregistrer ?
            </p>
          </div>

          {/* Mode selector */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setRecordingMode('audio')}
                disabled={isRecording}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  recordingMode === 'audio'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                } ${isRecording ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                Audio seulement
              </button>
              <button
                onClick={() => setRecordingMode('video')}
                disabled={isRecording}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  recordingMode === 'video'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                } ${isRecording ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                Vidéo + Audio
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-8">
            {/* Video preview */}
            {recordingMode === 'video' && (
              <div className="w-full max-w-2xl">
                <video
                  ref={videoRef}
                  className={`w-full rounded-lg shadow-lg ${
                    isVideoEnabled ? 'block' : 'hidden'
                  }`}
                  muted
                  playsInline
                />
                {!isVideoEnabled && !isRecording && (
                  <div className="w-full aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-16 h-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-gray-500">Aperçu vidéo</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Timer */}
            <div className="text-6xl font-mono font-bold text-gray-800">
              {formatTime(recordingTime)}
            </div>

            {/* Status indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`}></div>
              <span className="text-sm font-medium text-gray-600">
                {isRecording 
                  ? `Enregistrement ${recordingMode === 'video' ? 'vidéo' : 'audio'} en cours...` 
                  : `Prêt à enregistrer ${recordingMode === 'video' ? 'vidéo + audio' : 'audio'}`
                }
              </span>
            </div>

            {/* Control buttons */}
            <div className="flex space-x-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  {recordingMode === 'video' ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span>Commencer l'enregistrement</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  <span>Arrêter l'enregistrement</span>
                </button>
              )}
            </div>

            {/* Playback and download */}
            {recordedBlob && (
              <div className="w-full max-w-2xl space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    Votre enregistrement {recordingMode === 'video' ? 'vidéo' : 'audio'}
                  </h3>
                  
                  {recordingMode === 'video' ? (
                    <video 
                      controls 
                      className="w-full mb-4 rounded-lg"
                      src={URL.createObjectURL(recordedBlob)}
                    />
                  ) : (
                    <audio 
                      controls 
                      className="w-full mb-4"
                      src={URL.createObjectURL(recordedBlob)}
                    />
                  )}
                  
                  <button
                    onClick={downloadRecording}
                    className="w-full btn-primary flex items-center justify-center space-x-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Télécharger</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordPage;