import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const RecordPage: React.FC = () => {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<'audio' | 'video'>('audio');
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [isInitializing, setIsInitializing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  const cleanupResources = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVideoEnabled(false);
  };

  const checkPermissions = async () => {
    try {
      const audioPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (recordingMode === 'video') {
        const videoPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        return audioPermission.state === 'granted' && videoPermission.state === 'granted';
      }
      return audioPermission.state === 'granted';
    } catch (error) {
      console.log('Permission API not supported, will request directly');
      return false;
    }
  };

  const requestMediaAccess = async () => {
    setIsInitializing(true);
    
    try {
      // Configuration des contraintes média selon le mode
      const constraints = recordingMode === 'video' 
        ? { 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }, 
            video: { 
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              facingMode: 'user',
              frameRate: { ideal: 30, max: 60 }
            } 
          }
        : { 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }, 
            video: false 
          };

      console.log('Requesting media access with constraints:', constraints);
      
      // Nettoyer les ressources existantes avant de demander de nouvelles permissions
      cleanupResources();
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('Media access granted, stream tracks:', stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState
      })));
      
      streamRef.current = stream;
      setPermissionStatus('granted');
      
      // Afficher la vidéo en temps réel si mode vidéo
      if (recordingMode === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
          setIsVideoEnabled(true);
        } catch (playError) {
          console.error('Error playing video:', playError);
        }
      }
      
      return stream;
      
    } catch (error) {
      console.error('Erreur lors de l\'accès aux médias:', error);
      setPermissionStatus('denied');
      
      // Clean up resources after error to prevent conflicts
      cleanupResources();
      
      let errorMessage = 'Impossible d\'accéder aux médias.';
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = 'Accès refusé. Veuillez autoriser l\'accès au microphone' + 
              (recordingMode === 'video' ? ' et à la caméra' : '') + ' dans les paramètres de votre navigateur.';
            break;
          case 'NotFoundError':
            errorMessage = 'Aucun dispositif ' + 
              (recordingMode === 'video' ? 'audio/vidéo' : 'audio') + ' trouvé sur votre système.';
            break;
          case 'NotReadableError':
            errorMessage = 'Dispositif déjà utilisé par une autre application. Veuillez fermer les autres applications utilisant le microphone' +
              (recordingMode === 'video' ? ' ou la caméra' : '') + '.';
            break;
          case 'OverconstrainedError':
            errorMessage = 'Les paramètres demandés ne sont pas supportés par votre dispositif.';
            break;
          case 'SecurityError':
            errorMessage = 'Accès sécurisé requis. Assurez-vous d\'utiliser HTTPS.';
            break;
          default:
            errorMessage = `Erreur: ${error.message}`;
        }
      }
      
      alert(errorMessage);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  };

  const startRecording = async () => {
    try {
      setIsInitializing(true);
      
      // Obtenir l'accès aux médias
      let stream = streamRef.current;
      if (!stream || stream.getTracks().some(track => track.readyState === 'ended')) {
        stream = await requestMediaAccess();
      }
      
      if (!stream) {
        throw new Error('Impossible d\'obtenir le flux média');
      }

      // Vérifier que les pistes sont actives
      const activeTracks = stream.getTracks().filter(track => track.readyState === 'live');
      if (activeTracks.length === 0) {
        throw new Error('Aucune piste média active');
      }

      console.log('Starting recording with active tracks:', activeTracks.map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState
      })));

      // Déterminer le type MIME supporté
      let mimeType = '';
      const possibleTypes = recordingMode === 'video' 
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      
      for (const type of possibleTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      console.log('Using MIME type:', mimeType);
      
      // Créer le MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        bitsPerSecond: recordingMode === 'video' ? 2500000 : 128000 // 2.5Mbps pour vidéo, 128kbps pour audio
      });
      
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped, creating blob from', chunks.length, 'chunks');
        const blob = new Blob(chunks, { 
          type: recordingMode === 'video' ? 'video/webm' : 'audio/webm' 
        });
        console.log('Created blob:', blob.size, 'bytes');
        setRecordedBlob(blob);
        
        // Arrêter l'affichage vidéo
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setIsVideoEnabled(false);
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        alert('Erreur lors de l\'enregistrement: ' + (event as any).error?.message || 'Erreur inconnue');
      };

      mediaRecorder.onstart = () => {
        console.log('Recording started successfully');
      };

      // Démarrer l'enregistrement
      mediaRecorder.start(1000); // Collecter les données toutes les secondes
      setIsRecording(true);
      setRecordingTime(0);

      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      console.log('MediaRecorder started, state:', mediaRecorder.state);

    } catch (error) {
      console.error('Erreur lors du démarrage de l\'enregistrement:', error);
      
      let errorMessage = 'Impossible de démarrer l\'enregistrement.';
      if (error instanceof Error) {
        errorMessage += ' ' + error.message;
      }
      
      alert(errorMessage);
      setIsRecording(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopRecording = () => {
    console.log('Stopping recording...');
    
    if (mediaRecorderRef.current && isRecording) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
      }
      
      setIsRecording(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
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
      a.download = `${prefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const resetRecording = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    cleanupResources();
    setPermissionStatus('unknown');
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
                onClick={() => {
                  setRecordingMode('audio');
                  resetRecording();
                }}
                disabled={isRecording || isInitializing}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  recordingMode === 'audio'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                } ${(isRecording || isInitializing) ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                Audio seulement
              </button>
              <button
                onClick={() => {
                  setRecordingMode('video');
                  resetRecording();
                }}
                disabled={isRecording || isInitializing}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  recordingMode === 'video'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                } ${(isRecording || isInitializing) ? 'cursor-not-allowed opacity-50' : ''}`}
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
              <div className={`w-3 h-3 rounded-full ${
                isRecording ? 'bg-red-500 animate-pulse' : 
                isInitializing ? 'bg-yellow-500 animate-pulse' :
                'bg-gray-300'
              }`}></div>
              <span className="text-sm font-medium text-gray-600">
                {isInitializing 
                  ? 'Initialisation...'
                  : isRecording 
                    ? `Enregistrement ${recordingMode === 'video' ? 'vidéo' : 'audio'} en cours...` 
                    : `Prêt à enregistrer ${recordingMode === 'video' ? 'vidéo + audio' : 'audio'}`
                }
              </span>
            </div>

            {/* Permission status */}
            {permissionStatus === 'denied' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
                <div className="flex">
                  <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Permissions requises</h3>
                    <p className="text-sm text-red-700 mt-1">
                      Veuillez autoriser l'accès au microphone{recordingMode === 'video' ? ' et à la caméra' : ''} pour continuer.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Control buttons */}
            <div className="flex space-x-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isInitializing}
                  className={`flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors ${
                    isInitializing ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isInitializing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : recordingMode === 'video' ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span>{isInitializing ? 'Initialisation...' : 'Commencer l\'enregistrement'}</span>
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
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={downloadRecording}
                      className="flex-1 btn-primary flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Télécharger</span>
                    </button>
                    
                    <button
                      onClick={resetRecording}
                      className="btn-secondary flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Nouveau</span>
                    </button>
                  </div>
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