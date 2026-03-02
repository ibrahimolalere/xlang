'use client';

import { Bookmark, Eye, EyeOff, Minimize2 } from 'lucide-react';
import ReactPlayer from 'react-player';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';

import { FullscreenSubtitleOverlay } from '@/components/video-player/fullscreen-subtitle-overlay';
import { PlaybackControls } from '@/components/video-player/playback-controls';
import { cn, formatSeconds, getPlayableVideoUrl } from '@/lib/utils';
import {
  findCurrentSentence,
  formatVttTime,
  normalizePhrase,
  normalizeWord,
  tokenizeSentence
} from '@/lib/video/subtitle-utils';
import { getSavedWords, toggleSavedWord } from '@/lib/vocabulary';
import type { TranscriptSentence, Video } from '@/types/database';

interface VideoPlayerWithTranscriptProps {
  video: Video;
  transcript: TranscriptSentence[];
}

export function VideoPlayerWithTranscript({
  video,
  transcript
}: VideoPlayerWithTranscriptProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const playerViewportRef = useRef<HTMLDivElement>(null);
  const fullscreenOverlayRef = useRef<HTMLDivElement>(null);
  const fullscreenControlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const sentenceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isSimulatedFullscreen, setIsSimulatedFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [videoOrientation, setVideoOrientation] = useState<
    'unknown' | 'landscape' | 'portrait' | 'square'
  >('unknown');
  const [fullscreenMode, setFullscreenMode] = useState<'none' | 'container' | 'internal'>(
    'none'
  );
  const [activeWordKey, setActiveWordKey] = useState<string | null>(null);
  const [loadingWordKey, setLoadingWordKey] = useState<string | null>(null);
  const [wordTranslations, setWordTranslations] = useState<Record<string, string>>({});
  const [activePhrase, setActivePhrase] = useState<{
    sentenceId: string;
    phraseKey: string;
    normalized: string;
    text: string;
    sentenceText: string;
  } | null>(null);
  const [loadingPhraseKey, setLoadingPhraseKey] = useState<string | null>(null);
  const [phraseTranslations, setPhraseTranslations] = useState<Record<string, string>>({});
  const [sentenceTranslations, setSentenceTranslations] = useState<Record<string, string>>({});
  const [showSentenceTranslations, setShowSentenceTranslations] = useState(true);
  const [savedWordsSet, setSavedWordsSet] = useState<Set<string>>(new Set());
  const [isPausedByWordTap, setIsPausedByWordTap] = useState(false);
  const [showFullscreenSeekBar, setShowFullscreenSeekBar] = useState(true);
  const sentenceTranslationRequestedRef = useRef<Set<string>>(new Set());

  const getVideoElement = () =>
    playerRef.current?.getInternalPlayer?.() as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitExitFullscreen?: () => void;
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;

  useEffect(() => {
    const saved = getSavedWords();
    setSavedWordsSet(new Set(saved.map((word) => `${word.videoId}:${word.normalizedWord}`)));
  }, []);

  const subtitleTrackUrl = useMemo(() => {
    if (transcript.length === 0) {
      return null;
    }

    const vttBody = transcript
      .map(
        (sentence, index) =>
          `${index + 1}
${formatVttTime(sentence.start_time)} --> ${formatVttTime(sentence.end_time)}
${sentence.text}`
      )
      .join('\n\n');

    const blob = new Blob([`WEBVTT\n\n${vttBody}\n`], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
  }, [transcript]);

  const playableVideoUrl = useMemo(
    () => getPlayableVideoUrl(video.video_url),
    [video.video_url]
  );
  const isYouTubeVideo = useMemo(
    () => playableVideoUrl.includes('youtube.com') || playableVideoUrl.includes('youtu.be'),
    [playableVideoUrl]
  );

  const playerConfig = useMemo(() => {
    const baseAttributes = {
      controlsList: 'nofullscreen noremoteplayback nodownload noplaybackrate',
      disablePictureInPicture: true,
      disableRemotePlayback: true,
      'x-webkit-airplay': 'deny',
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: '#000'
      }
    } as const;

    return {
      youtube: {
        playerVars: {
          controls: 0,
          fs: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1
        }
      },
      file: {
        attributes: baseAttributes,
        tracks: subtitleTrackUrl
          ? [
              {
                kind: 'subtitles',
                src: subtitleTrackUrl,
                srcLang: 'de',
                label: 'German',
                default: true
              }
            ]
          : []
      }
    };
  }, [subtitleTrackUrl]);

  useEffect(() => {
    return () => {
      if (subtitleTrackUrl) {
        URL.revokeObjectURL(subtitleTrackUrl);
      }
    };
  }, [subtitleTrackUrl]);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };

    const updateFullscreenState = () => {
      const fullscreenElement = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      const playerContainer = playerViewportRef.current;

      if (!fullscreenElement || !playerContainer) {
        setFullscreenMode('none');
        return;
      }

      const playerNode = playerContainer as unknown as Node;
      const fullscreenNode = fullscreenElement as Node;
      if (fullscreenElement === playerContainer || fullscreenNode.contains(playerNode)) {
        setFullscreenMode('container');
        return;
      }

      if (playerNode.contains(fullscreenNode)) {
        setFullscreenMode('internal');
        return;
      }

      setFullscreenMode('none');
    };

    updateFullscreenState();

    document.addEventListener('fullscreenchange', updateFullscreenState);
    document.addEventListener(
      'webkitfullscreenchange',
      updateFullscreenState as EventListener
    );

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      document.removeEventListener(
        'webkitfullscreenchange',
        updateFullscreenState as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }

    const videoElement = getVideoElement();
    if (!videoElement) {
      return;
    }

    const handleNativeEnter = () => {
      setFullscreenMode('internal');
    };

    const handleNativeExit = () => {
      setFullscreenMode('none');
    };

    videoElement.addEventListener(
      'webkitbeginfullscreen',
      handleNativeEnter as EventListener
    );
    videoElement.addEventListener(
      'webkitendfullscreen',
      handleNativeExit as EventListener
    );

    return () => {
      videoElement.removeEventListener(
        'webkitbeginfullscreen',
        handleNativeEnter as EventListener
      );
      videoElement.removeEventListener(
        'webkitendfullscreen',
        handleNativeExit as EventListener
      );
    };
  }, [isPlayerReady]);

  useEffect(() => {
    if (!isPlayerReady || !subtitleTrackUrl) {
      return;
    }

    const videoElement = playerRef.current?.getInternalPlayer?.() as HTMLVideoElement | null;
    if (!videoElement || !videoElement.textTracks) {
      return;
    }

    const syncTrackVisibility = () => {
      try {
        const tracks = videoElement.textTracks;
        for (let index = 0; index < tracks.length; index += 1) {
          const track = tracks[index];
          if (track.kind === 'subtitles' || track.kind === 'captions') {
            // Use native subtitles only when internal video element enters fullscreen.
            track.mode = fullscreenMode === 'internal' ? 'showing' : 'hidden';
          }
        }
      } catch {
        // Ignore browser-specific text track mode errors.
      }
    };

    syncTrackVisibility();
    videoElement.addEventListener('loadedmetadata', syncTrackVisibility);

    return () => {
      videoElement.removeEventListener('loadedmetadata', syncTrackVisibility);
    };
  }, [fullscreenMode, isPlayerReady, subtitleTrackUrl]);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }

    const videoElement = playerRef.current?.getInternalPlayer?.() as HTMLVideoElement | null;
    if (!videoElement) {
      return;
    }

    const syncVideoMetrics = () => {
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      if (!width || !height) {
        return;
      }

      const ratio = width / height;
      setVideoAspectRatio(ratio);

      if (ratio < 0.95) {
        setVideoOrientation('portrait');
        return;
      }
      if (ratio > 1.05) {
        setVideoOrientation('landscape');
        return;
      }
      setVideoOrientation('square');
    };

    syncVideoMetrics();
    videoElement.addEventListener('loadedmetadata', syncVideoMetrics);
    videoElement.addEventListener('resize', syncVideoMetrics);

    return () => {
      videoElement.removeEventListener('loadedmetadata', syncVideoMetrics);
      videoElement.removeEventListener('resize', syncVideoMetrics);
    };
  }, [isPlayerReady, video.video_url]);

  const currentSentence = useMemo(
    () => findCurrentSentence(transcript, playedSeconds),
    [playedSeconds, transcript]
  );
  const currentSentenceId = currentSentence?.id;
  const isInteractiveFullscreen = fullscreenMode === 'container' || isSimulatedFullscreen;
  const isPortraitVideo = videoOrientation === 'portrait';
  const isSquareVideo = videoOrientation === 'square';
  const safeFullscreenPlayed = Math.min(
    Math.max(playedSeconds, 0),
    durationSeconds > 0 ? durationSeconds : playedSeconds
  );
  const fullscreenProgressPercent =
    durationSeconds > 0 ? Math.round((safeFullscreenPlayed / durationSeconds) * 100) : 0;
  const shouldShowVideoProgressBar = !isInteractiveFullscreen || showFullscreenSeekBar;
  const fullscreenProgressStyle = {
    '--yt-progress': `${fullscreenProgressPercent}%`,
    '--yt-fill': 'rgb(var(--accent))',
    '--yt-track': 'rgb(255 255 255 / 0.36)',
    '--yt-thumb-opacity': '0.9'
  } as CSSProperties;

  const clearFullscreenHideTimer = useCallback(() => {
    if (fullscreenControlsHideTimerRef.current) {
      clearTimeout(fullscreenControlsHideTimerRef.current);
      fullscreenControlsHideTimerRef.current = null;
    }
  }, []);

  const revealFullscreenSeekBar = useCallback(() => {
    setShowFullscreenSeekBar(true);
    clearFullscreenHideTimer();
    if (!isInteractiveFullscreen) {
      return;
    }
    fullscreenControlsHideTimerRef.current = setTimeout(() => {
      setShowFullscreenSeekBar(false);
    }, 3000);
  }, [clearFullscreenHideTimer, isInteractiveFullscreen]);

  useEffect(() => {
    if (!isSimulatedFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSimulatedFullscreen]);

  useEffect(() => {
    if (!isInteractiveFullscreen) {
      setShowFullscreenSeekBar(true);
      clearFullscreenHideTimer();
      return;
    }

    const viewport = playerViewportRef.current;
    if (!viewport) {
      return;
    }

    revealFullscreenSeekBar();

    viewport.addEventListener('mousemove', revealFullscreenSeekBar);
    viewport.addEventListener('pointermove', revealFullscreenSeekBar);
    viewport.addEventListener('touchstart', revealFullscreenSeekBar);
    viewport.addEventListener('pointerdown', revealFullscreenSeekBar);
    document.addEventListener('mousemove', revealFullscreenSeekBar);
    document.addEventListener('pointermove', revealFullscreenSeekBar);

    return () => {
      clearFullscreenHideTimer();
      viewport.removeEventListener('mousemove', revealFullscreenSeekBar);
      viewport.removeEventListener('pointermove', revealFullscreenSeekBar);
      viewport.removeEventListener('touchstart', revealFullscreenSeekBar);
      viewport.removeEventListener('pointerdown', revealFullscreenSeekBar);
      document.removeEventListener('mousemove', revealFullscreenSeekBar);
      document.removeEventListener('pointermove', revealFullscreenSeekBar);
    };
  }, [clearFullscreenHideTimer, isInteractiveFullscreen, revealFullscreenSeekBar]);

  useEffect(() => {
    if (!currentSentenceId) {
      return;
    }

    const target = sentenceRefs.current[currentSentenceId];
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });
  }, [currentSentenceId]);

  useEffect(() => {
    if (!isInteractiveFullscreen) {
      setActiveWordKey(null);
    }
  }, [isInteractiveFullscreen]);

  useEffect(() => {
    if (isInteractiveFullscreen) {
      return;
    }

    if (isPausedByWordTap) {
      setIsPausedByWordTap(false);
      setIsPlaying(true);
    }
  }, [isInteractiveFullscreen, isPausedByWordTap]);

  useEffect(() => {
    if (!isInteractiveFullscreen || !activeWordKey) {
      return;
    }

    const handleOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (fullscreenOverlayRef.current?.contains(target)) {
        return;
      }

      setActiveWordKey(null);
      if (isPausedByWordTap) {
        setIsPausedByWordTap(false);
        setIsPlaying(true);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePress, true);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePress, true);
    };
  }, [activeWordKey, isInteractiveFullscreen, isPausedByWordTap]);

  useEffect(() => {
    // Reset interactive subtitle selection when sentence changes to avoid stale DOM anchors.
    setActiveWordKey(null);
  }, [currentSentenceId]);

  const handleSeek = (seconds: number) => {
    // Jump video playback when a transcript sentence is clicked.
    playerRef.current?.seekTo(seconds, 'seconds');
    setPlayedSeconds(seconds);
  };

  const handleSetVolume = (nextVolume: number) => {
    const bounded = Math.max(0, Math.min(1, nextVolume));
    setVolume(bounded);
    setIsMuted(bounded === 0);
  };

  const stopOverlayEvent = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const fetchTranslation = useCallback(async (
    payload: { word?: string; text?: string },
    timeoutMs = 4500
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('/api/translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const result = (await response
        .json()
        .catch(() => ({ translation: 'translation unavailable' }))) as {
        translation?: string;
      };

      return result.translation ?? 'translation unavailable';
    } catch {
      return 'translation unavailable';
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    setSentenceTranslations({});
    sentenceTranslationRequestedRef.current = new Set();
  }, [video.id]);

  useEffect(() => {
    if (!transcript.length) {
      return;
    }

    let cancelled = false;

    const queue = transcript.filter(
      (sentence) => !sentenceTranslationRequestedRef.current.has(sentence.id)
    );
    queue.forEach((sentence) => {
      sentenceTranslationRequestedRef.current.add(sentence.id);
    });

    const workerCount = Math.min(6, queue.length);

    const runWorker = async () => {
      while (!cancelled) {
        const sentence = queue.shift();
        if (!sentence) {
          return;
        }

        const translated = await fetchTranslation({ text: sentence.text }, 5500);
        if (cancelled) {
          return;
        }

        setSentenceTranslations((previous) => {
          if (previous[sentence.id]) {
            return previous;
          }
          return {
            ...previous,
            [sentence.id]: translated
          };
        });
      }
    };

    void Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return () => {
      cancelled = true;
    };
  }, [fetchTranslation, transcript]);

  const toggleContainerFullscreen = async () => {
    const container = playerViewportRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (!container) {
      return;
    }

    try {
      if (isSimulatedFullscreen) {
        setIsSimulatedFullscreen(false);
        return;
      }

      if (fullscreenMode === 'none') {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
          return;
        }
        if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
          return;
        }
        // iOS fallback: app-controlled fullscreen to keep subtitle overlay interactive.
        setIsSimulatedFullscreen(true);
        return;
      }

      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
        return;
      }
      if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
        return;
      }
    } catch {
      // Prevent fullscreen API rejections from crashing the video page.
    }
  };

  const handleWordClick = async (
    event: SyntheticEvent<HTMLButtonElement>,
    word: string,
    tokenKey: string
  ) => {
    event.stopPropagation();
    setActivePhrase(null);

    if (activeWordKey === tokenKey) {
      setActiveWordKey(null);
      if (isInteractiveFullscreen && isPausedByWordTap) {
        setIsPausedByWordTap(false);
        setIsPlaying(true);
      }
      return;
    }

    setActiveWordKey(tokenKey);
    if (isInteractiveFullscreen && isPlaying) {
      setIsPlaying(false);
      setIsPausedByWordTap(true);
    }

    const normalized = normalizeWord(word);
    if (!normalized || wordTranslations[normalized]) {
      return;
    }

    setLoadingWordKey(tokenKey);

    try {
      const translated = await fetchTranslation({ word: normalized });
      setWordTranslations((previous) => ({
        ...previous,
        [normalized]: translated
      }));
    } catch {
      setWordTranslations((previous) => ({
        ...previous,
        [normalized]: 'translation unavailable'
      }));
    } finally {
      setLoadingWordKey(null);
    }
  };

  const handlePhraseSelection = async (
    event: React.MouseEvent<HTMLDivElement>,
    sentence: TranscriptSentence
  ) => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return;
    }

    const sentenceContainer = event.currentTarget;
    if (
      (selection.anchorNode && !sentenceContainer.contains(selection.anchorNode)) ||
      (selection.focusNode && !sentenceContainer.contains(selection.focusNode))
    ) {
      return;
    }

    const normalized = normalizePhrase(selectedText);
    if (!normalized || normalized.split(' ').length < 2) {
      return;
    }

    setActiveWordKey(null);

    const phraseKey = `${sentence.id}:${normalized}`;
    setActivePhrase({
      sentenceId: sentence.id,
      phraseKey,
      normalized,
      text: selectedText,
      sentenceText: sentence.text
    });

    if (phraseTranslations[normalized]) {
      return;
    }

    setLoadingPhraseKey(phraseKey);
    try {
      const translated = await fetchTranslation({ text: selectedText });
      setPhraseTranslations((previous) => ({
        ...previous,
        [normalized]: translated
      }));
    } catch {
      setPhraseTranslations((previous) => ({
        ...previous,
        [normalized]: 'translation unavailable'
      }));
    } finally {
      setLoadingPhraseKey(null);
    }
  };

  const handleSaveWordForLater = (
    event: SyntheticEvent<HTMLButtonElement>,
    params: { token: string; normalized: string; sentence: string }
  ) => {
    event.stopPropagation();
    const { token, normalized, sentence } = params;
    if (!normalized) {
      return;
    }

    const translation = wordTranslations[normalized] ?? 'translation unavailable';
    const key = `${video.id}:${normalized}`;
    const result = toggleSavedWord({
      word: token,
      normalizedWord: normalized,
      translation,
      sentence,
      videoId: video.id,
      videoTitle: video.title
    });

    setSavedWordsSet((previous) => {
      const next = new Set(previous);
      if (result.saved) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleTogglePhraseSave = (
    event: React.MouseEvent<HTMLButtonElement>,
    phrase: NonNullable<typeof activePhrase>
  ) => {
    event.stopPropagation();

    const translation =
      phraseTranslations[phrase.normalized] ?? 'translation unavailable';

    const key = `${video.id}:${phrase.normalized}`;
    const result = toggleSavedWord({
      word: phrase.text,
      normalizedWord: phrase.normalized,
      translation,
      sentence: phrase.sentenceText,
      videoId: video.id,
      videoTitle: video.title
    });

    setSavedWordsSet((previous) => {
      const next = new Set(previous);
      if (result.saved) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr] xl:gap-6">
      <div className="space-y-3 sm:space-y-4">
        <div
          ref={playerViewportRef}
          className={cn(
            'relative overflow-hidden rounded-xl border border-border/80 bg-black sm:rounded-2xl',
            isInteractiveFullscreen && 'h-[100dvh] w-[100dvw] rounded-none border-0 bg-black',
            isSimulatedFullscreen && 'fixed inset-0 z-[100] bg-black'
          )}
        >
          <div
            className={cn(
              'bg-black',
              !isInteractiveFullscreen &&
                (isPortraitVideo
                  ? 'mx-auto w-full max-w-[25rem]'
                  : isSquareVideo
                    ? 'mx-auto w-full max-w-[40rem]'
                    : 'w-full'),
              isInteractiveFullscreen && 'flex h-full w-full items-center'
            )}
            style={
              !isInteractiveFullscreen
                ? { aspectRatio: String(videoAspectRatio) }
                : undefined
            }
          >
            <ReactPlayer
              ref={playerRef}
              width="100%"
              height="100%"
              controls={!isYouTubeVideo}
              playing={isPlaying}
              muted={isMuted}
              volume={volume}
              playsinline
              playbackRate={playbackRate}
              url={playableVideoUrl}
              onReady={() => setIsPlayerReady(true)}
              onDuration={(duration) => setDurationSeconds(duration)}
              onPlay={() => {
                setIsPlaying(true);
                setIsPausedByWordTap(false);
              }}
              onPause={() => {
                setIsPlaying(false);
              }}
              config={playerConfig}
              onProgress={({ playedSeconds: seconds }) => setPlayedSeconds(seconds)}
            />
          </div>
          {isInteractiveFullscreen ? (
            <button
              type="button"
              className="absolute left-1/2 top-3 z-40 inline-flex h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-white/30 bg-black/60 px-3 text-white backdrop-blur-sm transition hover:bg-black/75"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void toggleContainerFullscreen();
              }}
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
            >
              <Minimize2 className="h-4 w-4" />
              <span className="hidden text-xs font-semibold sm:inline">Exit</span>
            </button>
          ) : null}
          {isInteractiveFullscreen && currentSentence ? (
            <FullscreenSubtitleOverlay
              sentence={currentSentence}
              isPortraitVideo={isPortraitVideo}
              activeWordKey={activeWordKey}
              loadingWordKey={loadingWordKey}
              wordTranslations={wordTranslations}
              savedWordsSet={savedWordsSet}
              videoId={video.id}
              overlayRef={fullscreenOverlayRef}
              onOverlayInteract={stopOverlayEvent}
              onWordClick={handleWordClick}
              onSaveWord={handleSaveWordForLater}
            />
          ) : null}
          {isInteractiveFullscreen && !showFullscreenSeekBar ? (
            <div
              className="absolute inset-0 z-[9] pointer-events-auto"
              onMouseMove={revealFullscreenSeekBar}
              onPointerMove={revealFullscreenSeekBar}
              onTouchStart={revealFullscreenSeekBar}
              onClick={revealFullscreenSeekBar}
            />
          ) : null}
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t px-2 pb-2 pt-10 transition-all duration-100 sm:px-3',
              isInteractiveFullscreen
                ? 'from-black/80 via-black/30 to-transparent'
                : 'from-black/68 via-black/26 to-transparent',
              shouldShowVideoProgressBar
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-2 opacity-0'
            )}
          >
            <div className="pointer-events-auto w-full">
              <div
                className={cn(
                  'mb-1.5 flex items-center justify-between text-[11px] font-semibold sm:text-xs',
                  isInteractiveFullscreen ? 'text-white/90' : 'text-white/85'
                )}
              >
                <span>{formatSeconds(safeFullscreenPlayed)}</span>
                <span>{durationSeconds > 0 ? formatSeconds(durationSeconds) : '--:--'}</span>
              </div>
              <input
                type="range"
                min={0}
                max={durationSeconds > 0 ? durationSeconds : 100}
                step={0.1}
                value={durationSeconds > 0 ? safeFullscreenPlayed : 0}
                onChange={(event) => handleSeek(Number(event.target.value))}
                className="yt-progress-range yt-progress-range--dark w-full"
                style={fullscreenProgressStyle}
                aria-label={
                  isInteractiveFullscreen ? 'Seek video in fullscreen' : 'Seek video'
                }
              />
            </div>
          </div>
        </div>

        <PlaybackControls
          playbackRate={playbackRate}
          isMuted={isMuted}
          volume={volume}
          fullscreenMode={isInteractiveFullscreen ? 'container' : fullscreenMode}
          onSetPlaybackRate={setPlaybackRate}
          onSetMuted={(muted) => setIsMuted(muted)}
          onSetVolume={handleSetVolume}
          onToggleFullscreen={() => {
            void toggleContainerFullscreen();
          }}
        />
      </div>

      <aside className="overflow-hidden rounded-2xl border border-border/80 bg-panel xl:flex xl:max-h-[78vh] xl:flex-col">
        <div className="sticky top-0 z-10 border-b border-border/80 bg-panel/95 px-4 py-4 backdrop-blur sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-ink">Transcript</h2>
              <p className="mt-1 text-sm font-medium text-muted">
                Listen your way: show or hide English support while following German.
              </p>
            </div>
            <button
              type="button"
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition',
                showSentenceTranslations
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
              )}
              onClick={() => setShowSentenceTranslations((previous) => !previous)}
              aria-label={
                showSentenceTranslations
                  ? 'Hide English translations'
                  : 'Show English translations'
              }
              title={
                showSentenceTranslations
                  ? 'Hide English translations'
                  : 'Show English translations'
              }
            >
              {showSentenceTranslations ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="max-h-[56vh] space-y-2.5 overflow-y-auto px-4 pb-4 pt-3 sm:max-h-[62vh] sm:px-5 sm:pb-5 xl:max-h-none xl:flex-1">
          {transcript.length === 0 ? (
            <p className="rounded-xl border border-border/80 bg-surface p-4 text-sm text-muted">
              Transcript is not available yet for this video.
            </p>
          ) : null}
          {transcript.map((sentence) => {
            const isActive = sentence.id === currentSentenceId;
            const hasActivePhrase = activePhrase?.sentenceId === sentence.id;
            const phraseTranslation = hasActivePhrase
              ? phraseTranslations[activePhrase.normalized]
              : undefined;
            const isPhraseSaved = hasActivePhrase
              ? savedWordsSet.has(`${video.id}:${activePhrase.normalized}`)
              : false;

            return (
              <div
                key={sentence.id}
                ref={(node) => {
                  sentenceRefs.current[sentence.id] = node;
                }}
                className={cn(
                  'rounded-xl border p-3 transition sm:p-4',
                  isActive
                    ? 'border-accent bg-accent/10'
                    : 'border-border/80 bg-surface hover:border-accent/50'
                )}
              >
                <div
                  className="w-full cursor-pointer text-left"
                  onClick={() => {
                    const selected = window.getSelection()?.toString().trim();
                    if (selected) {
                      return;
                    }
                    handleSeek(sentence.start_time);
                  }}
                  onMouseUp={(event) => {
                    void handlePhraseSelection(event, sentence);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSeek(sentence.start_time);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {hasActivePhrase && activePhrase ? (
                    <div className="mb-2 mt-2 inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-panel px-3 py-2 text-xs font-semibold text-ink sm:text-sm">
                      <span className="text-xs font-medium sm:text-sm">
                        {loadingPhraseKey === activePhrase.phraseKey
                          ? '...'
                          : (phraseTranslation ?? 'translation unavailable')}
                      </span>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center justify-center rounded-md border p-1.5 transition',
                          isPhraseSaved
                            ? 'border-warm bg-warm/15 text-warm'
                            : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                        )}
                        onClick={(event) => handleTogglePhraseSave(event, activePhrase)}
                        disabled={loadingPhraseKey === activePhrase.phraseKey}
                        aria-label={isPhraseSaved ? 'Unsave phrase' : 'Save phrase'}
                        title={isPhraseSaved ? 'Unsave phrase' : 'Save phrase'}
                      >
                        <Bookmark
                          className={cn(
                            'h-4 w-4',
                            isPhraseSaved ? 'fill-current' : ''
                          )}
                        />
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-1 font-[var(--font-heading)] text-lg font-bold leading-relaxed text-ink sm:text-xl">
                    {tokenizeSentence(sentence.text).map((token, index) => {
                      const normalized = normalizeWord(token);
                      const isWord = normalized.length > 0;
                      const tokenKey = `${sentence.id}-${index}`;
                      const isWordActive = activeWordKey === tokenKey;
                      const translation = wordTranslations[normalized];
                      const isWordSaved = savedWordsSet.has(`${video.id}:${normalized}`);

                      if (!isWord) {
                        return <span key={tokenKey}>{token}</span>;
                      }

                      return (
                        <span key={tokenKey} className="relative inline-block">
                          <button
                            className={cn(
                              'inline rounded px-1 py-0.5 transition',
                              isWordActive ? 'bg-accent/20' : 'hover:bg-accent/10'
                            )}
                            onClick={(event) => handleWordClick(event, token, tokenKey)}
                            type="button"
                          >
                            {token}
                          </button>
                          {isWordActive ? (
                            <span className="absolute bottom-full left-1/2 z-10 mb-1.5 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-border/80 bg-panel px-3 py-2 text-xs font-semibold text-ink sm:text-sm">
                              <span className="text-xs font-medium sm:text-sm">
                                {loadingWordKey === tokenKey
                                  ? '...'
                                  : (translation ?? 'translation unavailable')}
                              </span>
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex items-center justify-center rounded-md border p-1.5 transition',
                                  isWordSaved
                                    ? 'border-warm bg-warm/15 text-warm'
                                    : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                                )}
                                onClick={(event) =>
                                  handleSaveWordForLater(event, {
                                    token,
                                    normalized,
                                    sentence: sentence.text
                                  })
                                }
                                disabled={loadingWordKey === tokenKey}
                                aria-label={isWordSaved ? 'Unsave word' : 'Save word'}
                                title={isWordSaved ? 'Unsave word' : 'Save word'}
                              >
                                <Bookmark
                                  className={cn(
                                    'h-4 w-4',
                                    isWordSaved ? 'fill-current' : ''
                                  )}
                                />
                              </button>
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                  {showSentenceTranslations ? (
                    <p className="mt-2 font-[var(--font-heading)] text-base font-normal leading-relaxed text-muted sm:text-lg">
                      {sentenceTranslations[sentence.id] ?? '...'}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
