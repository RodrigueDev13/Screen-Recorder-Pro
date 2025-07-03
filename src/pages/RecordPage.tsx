import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

type RecordingMode = 'audio' | 'video' | 'screen' | 'screen-audio';
type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

interface MediaPermissions {
  audio: PermissionStatus;
  video: PermissionStatus;
  screen: PermissionStatus;
}

const RecordPage: React.FC = () => {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('audio');
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [permissions, setPermissions] = useState<MediaPermissions>({
    audio: 'unknown',
    video: 'unknown',
    screen: 'unknown'
  });
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{
    audioDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
  }>({
    audioDevices: [],
    videoDevices: []
  });
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isCleaningUpRef = useRef(false);

  useEffect(() => {
    checkDeviceAvailability();
    checkPermissions();
    
    return () => {
      cleanupResources();
    };
  }, []);

  const checkDeviceAvailability = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      setDeviceInfo({ audioDevices, videoDevices });
      
      console.log('Available devices:', {
        audio: audioDevices.length,
        video: videoDevices.length
      });
    } catch (error) {
      console.error('Error enumerating devices:', error);
    }
  };

  const checkPermissions = async () => {
    try {
      // Vérifier les permissions existantes
      if ('permissions' in navigator) {
        const audioPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        const videoPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        
        setPermissions(prev => ({
          ...prev,
          audio: audioPermission.state as PermissionStatus,
          video: videoPermission.state as PermissionStatus
        }));

        // Écouter les changements de permissions
        audioPermission.addEventListener('change', () => {
          setPermissions(prev => ({
            ...prev,
            audio: audioPermission.state as PermissionStatus
          }));
        });

        videoPermission.addEventListener('change', () => {
          setPermissions(prev => ({
            ...prev,
            video: videoPermission.state as PermissionStatus
          }));
        });
      }
    } catch (error) {
      console.log('Permission API not fully supported:', error);
    }
  };

  const cleanupResources = async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    try {
      // Arrêter MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.log('MediaRecorder already stopped:', error);
        }
      }
      mediaRecorderRef.current = null;

      // Arrêter tous les flux
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        streamRef.current = null;
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        screenStreamRef.current = null;
      }

      // Nettoyer l'intervalle
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Nettoyer la vidéo
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
        videoRef.current.load();
      }

      setIsVideoEnabled(false);
      setError(null);

      await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
      isCleaningUpRef.current = false;
    }
  };

  const requestScreenShare = async (): Promise<MediaStream> => {
    try {
      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Partage d\'écran non supporté par votre navigateur');
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: recordingMode === 'screen-audio'
      });

      // Écouter l'arrêt du partage d'écran
      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('Screen sharing stopped by user');
        if (isRecording) {
          stopRecording();
        }
      });

      setPermissions(prev => ({ ...prev, screen: 'granted' }));
      return screenStream;
    } catch (error) {
      console.error('Error requesting screen share:', error);
      setPermissions(prev => ({ ...prev, screen: 'denied' }));
      
      let errorMessage = 'Impossible d\'accéder au partage d\'écran.';
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = 'Partage d\'écran refusé. Veuillez autoriser le partage d\'écran.';
            break;
          case 'NotFoundError':
            errorMessage = 'Aucun écran disponible pour le partage.';
            break;
          case 'NotSupportedError':
            errorMessage = 'Partage d\'écran non supporté par votre navigateur.';
            break;
          default:
            errorMessage = error.message || 'Erreur lors du partage d\'écran';
        }
      }
      
      throw new Error(errorMessage);
    }
  };

  const requestMediaAccess = async (): Promise<MediaStream> => {
    setIsInitializing(true);
    setError(null);
    
    try {
      await cleanupResources();
      await new Promise(resolve => setTimeout(resolve, 200));

      let finalStream: MediaStream;

      if (recordingMode === 'screen' || recordingMode === 'screen-audio') {
        // Partage d'écran
        const screenStream = await requestScreenShare();
        screenStreamRef.current = screenStream;

        if (recordingMode === 'screen-audio') {
          // Ajouter l'audio du microphone au partage d'écran
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
              },
              video: false
            });

            // Combiner les flux
            const combinedStream = new MediaStream();
            
            // Ajouter la vidéo de l'écran
            screenStream.getVideoTracks().forEach(track => {
              combinedStream.addTrack(track);
            });
            
            // Ajouter l'audio de l'écran (si disponible)
            screenStream.getAudioTracks().forEach(track => {
              combinedStream.addTrack(track);
            });
            
            // Ajouter l'audio du microphone
            audioStream.getAudioTracks().forEach(track => {
              combinedStream.addTrack(track);
            });

            finalStream = combinedStream;
            setPermissions(prev => ({ ...prev, audio: 'granted' }));
          } catch (audioError) {
            console.warn('Could not add microphone audio:', audioError);
            finalStream = screenStream;
          }
        } else {
          finalStream = screenStream;
        }

        // Afficher l'aperçu de l'écran
        if (videoRef.current) {
          videoRef.current.srcObject = screenStream;
          try {
            await videoRef.current.play();
            setIsVideoEnabled(true);
          } catch (playError) {
            console.error('Error playing screen preview:', playError);
          }
        }

      } else {
        // Enregistrement caméra/audio classique
        const constraints = recordingMode === 'video' 
          ? { 
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 2
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
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 2
              }, 
              video: false 
            };

        console.log('Requesting media access with constraints:', constraints);
        
        finalStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        setPermissions(prev => ({
          ...prev,
          audio: 'granted',
          video: recordingMode === 'video' ? 'granted' : prev.video
        }));

        // Afficher la vidéo en temps réel si mode vidéo
        if (recordingMode === 'video' && videoRef.current) {
          videoRef.current.srcObject = finalStream;
          try {
            await videoRef.current.play();
            setIsVideoEnabled(true);
          } catch (playError) {
            console.error('Error playing video:', playError);
          }
        }
      }

      // Vérifier que le flux est valide
      if (!finalStream || finalStream.getTracks().length === 0) {
        throw new Error('Flux média invalide reçu');
      }

      const activeTracks = finalStream.getTracks().filter(track => track.readyState === 'live');
      if (activeTracks.length === 0) {
        finalStream.getTracks().forEach(track => track.stop());
        throw new Error('Aucune piste média active obtenue');
      }
      
      console.log('Media access granted, stream tracks:', activeTracks.map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        label: track.label
      })));
      
      streamRef.current = finalStream;
      return finalStream;
      
    } catch (error) {
      console.error('Erreur lors de l\'accès aux médias:', error);
      
      await cleanupResources();
      
      let errorMessage = 'Impossible d\'accéder aux médias.';
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = 'Accès refusé. Veuillez autoriser l\'accès aux médias demandés dans les paramètres de votre navigateur.';
            break;
          case 'NotFoundError':
            errorMessage = 'Aucun dispositif trouvé. Vérifiez que vos périphériques sont connectés.';
            break;
          case 'NotReadableError':
            errorMessage = 'Dispositif déjà utilisé par une autre application. Fermez les autres applications et réessayez.';
            break;
          case 'OverconstrainedError':
            errorMessage = 'Les paramètres demandés ne sont pas supportés par votre dispositif.';
            break;
          case 'SecurityError':
            errorMessage = 'Accès sécurisé requis. Assurez-vous d\'utiliser HTTPS.';
            break;
          case 'AbortError':
            errorMessage = 'Demande d\'accès annulée. Veuillez réessayer.';
            break;
          default:
            errorMessage = error.message || 'Erreur inconnue lors de l\'accès aux médias';
        }
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsInitializing(false);
    }
  };

  const startRecording = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      
      // Obtenir l'accès aux médias
      const stream = await requestMediaAccess();
      
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
        readyState: track.readyState,
        label: track.label
      })));

      // Déterminer le type MIME supporté
      let mimeType = '';
      const possibleTypes = (recordingMode === 'video' || recordingMode === 'screen' || recordingMode === 'screen-audio')
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      
      for (const type of possibleTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      if (!mimeType) {
        throw new Error('Aucun format d\'enregistrement supporté par votre navigateur');
      }
      
      console.log('Using MIME type:', mimeType);
      
      // Créer le MediaRecorder avec des options optimisées
      const options: MediaRecorderOptions = {
        mimeType: mimeType,
        bitsPerSecond: (recordingMode === 'video' || recordingMode === 'screen' || recordingMode === 'screen-audio') ? 2500000 : 128000
      };

      const mediaRecorder = new MediaRecorder(stream, options);
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
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { 
            type: (recordingMode === 'video' || recordingMode === 'screen' || recordingMode === 'screen-audio') ? 'video/webm' : 'audio/webm' 
          });
          console.log('Created blob:', blob.size, 'bytes');
          setRecordedBlob(blob);
        } else {
          setError('Aucune donnée enregistrée');
        }
        
        // Arrêter l'affichage vidéo
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setIsVideoEnabled(false);
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        const errorMsg = 'Erreur lors de l\'enregistrement: ' + ((event as any).error?.message || 'Erreur inconnue');
        setError(errorMsg);
        setIsRecording(false);
      };

      mediaRecorder.onstart = () => {
        console.log('Recording started successfully');
        setError(null);
      };

      // Démarrer l'enregistrement
      mediaRecorder.start(1000);
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
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setIsRecording(false);
      await cleanupResources();
    } finally {
      setIsInitializing(false);
    }
  };

  const stopRecording = async () => {
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
      const extension = 'webm';
      const prefix = recordingMode === 'audio' ? 'audio' : 
                    recordingMode === 'video' ? 'video' :
                    recordingMode === 'screen' ? 'screen' : 'screen-audio';
      a.download = `${prefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const resetRecording = async () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    setError(null);
    await cleanupResources();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getModeLabel = (mode: RecordingMode) => {
    switch (mode) {
      case 'audio': return 'Audio seulement';
      case 'video': return 'Vidéo + Audio';
      case 'screen': return 'Partage d\'écran';
      case 'screen-audio': return 'Écran + Micro';
      default: return mode;
    }
  };

  const getModeIcon = (mode: RecordingMode) => {
    switch (mode) {
      case 'audio':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
        );
      case 'screen':
      case 'screen-audio':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm0 3a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Enregistrement {getModeLabel(recordingMode)}
            </h1>
            <p className="text-gray-600">
              Bonjour {user?.name}, prêt à enregistrer ?
            </p>
          </div>

          {/* Mode selector */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 p-1 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-1">
              {(['audio', 'video', 'screen', 'screen-audio'] as RecordingMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setRecordingMode(mode);
                    resetRecording();
                  }}
                  disabled={isRecording || isInitializing}
                  className={`px-3 py-2 rounded-md font-medium transition-colors text-sm ${
                    recordingMode === mode
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  } ${(isRecording || isInitializing) ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {getModeLabel(mode)}
                </button>
              ))}
            </div>
          </div>

          {/* Device info */}
          <div className="flex justify-center mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div className="flex items-center space-x-4 text-blue-700">
                <span>🎤 {deviceInfo.audioDevices.length} microphone(s)</span>
                <span>📹 {deviceInfo.videoDevices.length} caméra(s)</span>
                <span>🖥️ Partage d'écran {navigator.mediaDevices.getDisplayMedia ? 'disponible' : 'non supporté'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-8">
            {/* Video preview */}
            {(recordingMode === 'video' || recordingMode === 'screen' || recordingMode === 'screen-audio') && (
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
                      {recordingMode === 'video' ? (
                        <svg className="w-16 h-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-16 h-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      )}
                      <p className="text-gray-500">
                        {recordingMode === 'video' ? 'Aperçu caméra' : 'Aperçu écran'}
                      </p>
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
                    ? `Enregistrement ${getModeLabel(recordingMode).toLowerCase()} en cours...` 
                    : `Prêt à enregistrer ${getModeLabel(recordingMode).toLowerCase()}`
                }
              </span>
            </div>

            {/* Error display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
                <div className="flex">
                  <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Erreur</h3>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Permission status */}
            {(permissions.audio === 'denied' || permissions.video === 'denied' || permissions.screen === 'denied') && !error && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-2xl w-full">
                <div className="flex">
                  <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800">Permissions requises</h3>
                    <p className="text-sm text-yellow-700 mt-1">
                      Certaines permissions ont été refusées. Veuillez les autoriser dans les paramètres de votre navigateur.
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
                  ) : (
                    getModeIcon(recordingMode)
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
                    Votre enregistrement {getModeLabel(recordingMode).toLowerCase()}
                  </h3>
                  
                  {(recordingMode === 'video' || recordingMode === 'screen' || recordingMode === 'screen-audio') ? (
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

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl w-full">
              <h4 className="text-sm font-medium text-blue-800 mb-2">Instructions :</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Audio :</strong> Enregistre uniquement le son du microphone</li>
                <li>• <strong>Vidéo + Audio :</strong> Enregistre la caméra et le microphone</li>
                <li>• <strong>Partage d'écran :</strong> Enregistre l'écran (avec audio système si disponible)</li>
                <li>• <strong>Écran + Micro :</strong> Combine l'écran et le microphone</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordPage;