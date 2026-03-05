'use client';

import { Minimize2 } from 'lucide-react';
import ReactPlayer from 'react-player';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';

import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';
import { FullscreenSubtitleOverlay } from '@/components/video-player/fullscreen-subtitle-overlay';
import { PlaybackControls } from '@/components/video-player/playback-controls';
import {
  TranscriptPanel,
  type ActivePhraseSelection
} from '@/components/video-player/transcript-panel';
import { cn, formatSeconds, getPlayableVideoUrl } from '@/lib/utils';
import {
  findCurrentSentence,
  formatVttTime,
  normalizePhrase,
  normalizeWord
} from '@/lib/video/subtitle-utils';
import { getSavedWords, syncSavedWordsFromServer, toggleSavedWord } from '@/lib/vocabulary';
import type { TranscriptSentence, Video } from '@/types/database';

interface VideoPlayerWithTranscriptProps {
  video: Video;
  transcript: TranscriptSentence[];
}

const LEARNER_PROFILE_STORAGE_KEY = 'xlang_learner_profile';
const LEARNER_KEY_STORAGE_KEY = 'xlang_learner_key';

function resolveLearnerKey() {
  if (typeof window === 'undefined') {
    return 'guest';
  }

  try {
    const profileRaw = window.localStorage.getItem(LEARNER_PROFILE_STORAGE_KEY);
    if (profileRaw) {
      const parsed = JSON.parse(profileRaw) as { learnerKey?: string };
      const fromProfile = String(parsed?.learnerKey ?? '').trim();
      if (fromProfile) {
        return fromProfile;
      }
    }
  } catch {
    // Ignore malformed profile payloads.
  }

  const existing = window.localStorage.getItem(LEARNER_KEY_STORAGE_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `learner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(LEARNER_KEY_STORAGE_KEY, generated);
  return generated;
}

export function VideoPlayerWithTranscript({
  video,
  transcript
}: VideoPlayerWithTranscriptProps) {
  const { user } = useSupabaseAuth();
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
  const [activePhrase, setActivePhrase] = useState<ActivePhraseSelection | null>(null);
  const [loadingPhraseKey, setLoadingPhraseKey] = useState<string | null>(null);
  const [phraseTranslations, setPhraseTranslations] = useState<Record<string, string>>({});
  const [sentenceTranslations, setSentenceTranslations] = useState<Record<string, string>>({});
  const [showSentenceTranslations, setShowSentenceTranslations] = useState(true);
  const [savedWordsSet, setSavedWordsSet] = useState<Set<string>>(new Set());
  const [learnerKey, setLearnerKey] = useState('guest');
  const [isPausedByWordTap, setIsPausedByWordTap] = useState(false);
  const [showFullscreenSeekBar, setShowFullscreenSeekBar] = useState(true);
  const sentenceTranslationRequestedRef = useRef<Set<string>>(new Set());
  const translationRequestCacheRef = useRef(new Map<string, Promise<string>>());

  const getVideoElement = () =>
    playerRef.current?.getInternalPlayer?.() as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitExitFullscreen?: () => void;
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;

  useEffect(() => {
    const resolvedLearnerKey = user?.id ?? resolveLearnerKey();
    setLearnerKey(resolvedLearnerKey);
    const saved = getSavedWords(resolvedLearnerKey);
    setSavedWordsSet(new Set(saved.map((word) => `${word.videoId}:${word.normalizedWord}`)));

    if (resolvedLearnerKey !== 'guest') {
      void syncSavedWordsFromServer(resolvedLearnerKey).then((words) => {
        setSavedWordsSet(new Set(words.map((word) => `${word.videoId}:${word.normalizedWord}`)));
      });
    }
  }, [user?.id]);

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
  const currentSentenceIndex = useMemo(
    () =>
      currentSentenceId
        ? transcript.findIndex((sentence) => sentence.id === currentSentenceId)
        : -1,
    [currentSentenceId, transcript]
  );
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
    revealFullscreenSeekBar();
  };

  const fetchTranslation = useCallback(
    async (payload: { word?: string; text?: string }, timeoutMs = 4500) => {
      const rawWord = payload.word?.trim();
      const rawText = payload.text?.trim();
      const requestKey = rawWord
        ? `w:${rawWord.toLowerCase()}`
        : `t:${(rawText ?? '').toLowerCase()}`;

      if (!requestKey || requestKey === 't:') {
        return 'translation unavailable';
      }

      const existingRequest = translationRequestCacheRef.current.get(requestKey);
      if (existingRequest) {
        return existingRequest;
      }

      const requestPromise = (async () => {
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
      })();

      translationRequestCacheRef.current.set(requestKey, requestPromise);
      void requestPromise.then((value) => {
        if (value === 'translation unavailable') {
          translationRequestCacheRef.current.delete(requestKey);
        }
      });
      return requestPromise;
    },
    []
  );

  useEffect(() => {
    setSentenceTranslations({});
    sentenceTranslationRequestedRef.current = new Set();
    translationRequestCacheRef.current = new Map();
  }, [video.id]);

  useEffect(() => {
    if (!showSentenceTranslations || !transcript.length) {
      return;
    }

    let cancelled = false;

    const centerIndex = currentSentenceIndex >= 0 ? currentSentenceIndex : 0;
    const windowStart = Math.max(centerIndex - 10, 0);
    const windowEnd = Math.min(centerIndex + 14, transcript.length - 1);
    const windowCandidates: TranscriptSentence[] = [];

    for (let index = windowStart; index <= windowEnd; index += 1) {
      windowCandidates.push(transcript[index]);
    }

    if (windowStart > 0) {
      // Preload the first few lines so users entering mid-video still see immediate context.
      for (let index = 0; index < Math.min(6, transcript.length); index += 1) {
        const sentence = transcript[index];
        if (!windowCandidates.some((candidate) => candidate.id === sentence.id)) {
          windowCandidates.push(sentence);
        }
      }
    }

    const queue = windowCandidates.filter(
      (sentence) => !sentenceTranslationRequestedRef.current.has(sentence.id)
    );
    queue.forEach((sentence) => {
      sentenceTranslationRequestedRef.current.add(sentence.id);
    });

    const workerCount = Math.min(3, queue.length);

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
  }, [currentSentenceIndex, fetchTranslation, showSentenceTranslations, transcript]);

  const toggleContainerFullscreen = async () => {
    const container = playerViewportRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const videoElement = getVideoElement();

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
      if (videoElement?.webkitExitFullscreen) {
        videoElement.webkitExitFullscreen();
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
    void (async () => {
      const { token, normalized, sentence } = params;
      if (!normalized) {
        return;
      }

      const translation = wordTranslations[normalized] ?? 'translation unavailable';
      const key = `${video.id}:${normalized}`;
      const result = await Promise.resolve(
        toggleSavedWord({
          learnerKey,
          word: token,
          normalizedWord: normalized,
          translation,
          sentence,
          videoId: video.id,
          videoTitle: video.title
        })
      );

      setSavedWordsSet((previous) => {
        const next = new Set(previous);
        if (result.saved) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    })();
  };

  const handleTogglePhraseSave = (
    event: React.MouseEvent<HTMLButtonElement>,
    phrase: NonNullable<typeof activePhrase>
  ) => {
    event.stopPropagation();
    void (async () => {
      const translation =
        phraseTranslations[phrase.normalized] ?? 'translation unavailable';

      const key = `${video.id}:${phrase.normalized}`;
      const result = await Promise.resolve(
        toggleSavedWord({
          learnerKey,
          word: phrase.text,
          normalizedWord: phrase.normalized,
          translation,
          sentence: phrase.sentenceText,
          videoId: video.id,
          videoTitle: video.title
        })
      );

      setSavedWordsSet((previous) => {
        const next = new Set(previous);
        if (result.saved) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    })();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr] xl:gap-6">
      <div className="space-y-3 sm:space-y-4">
        <div
          ref={playerViewportRef}
          className={cn(
            'relative overflow-hidden rounded-xl border border-border/80 bg-black sm:rounded-2xl',
            !isInteractiveFullscreen &&
              !isSimulatedFullscreen &&
              'sticky z-30 top-[6.25rem] sm:top-16',
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
              className="absolute left-1/2 top-3 z-[70] inline-flex h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-white/30 bg-black/60 px-3 text-white backdrop-blur-sm transition hover:bg-black/75"
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
              onUserInteraction={revealFullscreenSeekBar}
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
              'absolute inset-x-0 bottom-0 z-[35] bg-gradient-to-t px-2 pb-2 pt-10 transition-all duration-100 sm:px-3',
              isInteractiveFullscreen
                ? 'from-black/80 via-black/30 to-transparent'
                : 'from-black/68 via-black/26 to-transparent',
              shouldShowVideoProgressBar
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-2 opacity-0'
            )}
          >
            <div className="pointer-events-none w-full">
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
                className="yt-progress-range yt-progress-range--dark pointer-events-auto w-full"
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

        <div className="rounded-xl border border-border/80 bg-panel p-4 sm:rounded-2xl sm:p-5">
          <p className="text-sm leading-relaxed text-muted sm:text-base">
            {video.description}
          </p>
        </div>
      </div>

      <TranscriptPanel
        transcript={transcript}
        currentSentenceId={currentSentenceId}
        activePhrase={activePhrase}
        loadingPhraseKey={loadingPhraseKey}
        phraseTranslations={phraseTranslations}
        savedWordsSet={savedWordsSet}
        videoId={video.id}
        activeWordKey={activeWordKey}
        loadingWordKey={loadingWordKey}
        wordTranslations={wordTranslations}
        showSentenceTranslations={showSentenceTranslations}
        sentenceTranslations={sentenceTranslations}
        sentenceRefs={sentenceRefs}
        onToggleSentenceTranslations={() =>
          setShowSentenceTranslations((previous) => !previous)
        }
        onSeek={handleSeek}
        onPhraseSelection={handlePhraseSelection}
        onTogglePhraseSave={handleTogglePhraseSave}
        onWordClick={handleWordClick}
        onSaveWord={handleSaveWordForLater}
      />
    </div>
  );
}
