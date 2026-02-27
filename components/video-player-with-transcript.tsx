'use client';

import { Bookmark, Gauge, Maximize2, Minimize2 } from 'lucide-react';
import ReactPlayer from 'react-player';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn, formatSeconds, getPlayableVideoUrl } from '@/lib/utils';
import { getSavedWords, toggleSavedWord } from '@/lib/vocabulary';
import type { TranscriptSentence, Video } from '@/types/database';

interface VideoPlayerWithTranscriptProps {
  video: Video;
  transcript: TranscriptSentence[];
}

const SPEEDS = [0.75, 1, 1.25, 1.5];

function formatVttTime(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.floor(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(milliseconds).padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-zA-ZäöüÄÖÜß]/g, '')
    .replace(/[Ä]/g, 'ä')
    .replace(/[Ö]/g, 'ö')
    .replace(/[Ü]/g, 'ü')
    .trim();
}

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-ZäöüÄÖÜß\s]/g, ' ')
    .replace(/[Ä]/g, 'ä')
    .replace(/[Ö]/g, 'ö')
    .replace(/[Ü]/g, 'ü')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSentence(text: string): string[] {
  return text
    .split(/(\s+|[.,!?;:"(){}\[\]„“‚‘…—–-])/g)
    .filter((token) => token.length > 0);
}

export function VideoPlayerWithTranscript({
  video,
  transcript
}: VideoPlayerWithTranscriptProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const playerViewportRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
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
  const [loadingSentenceId, setLoadingSentenceId] = useState<string | null>(null);
  const [phraseTranslations, setPhraseTranslations] = useState<Record<string, string>>({});
  const [savedWordsSet, setSavedWordsSet] = useState<Set<string>>(new Set());

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

  const playerConfig = useMemo(() => {
    const baseAttributes = {
      controlsList: 'nofullscreen',
      disablePictureInPicture: true,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: '#000'
      }
    } as const;

    if (!subtitleTrackUrl) {
      return {
        file: {
          attributes: baseAttributes
        }
      };
    }

    return {
      file: {
        attributes: baseAttributes,
        tracks: [
          {
            kind: 'subtitles',
            src: subtitleTrackUrl,
            srcLang: 'de',
            label: 'German',
            default: true
          }
        ]
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

  const currentSentence = useMemo(() => {
    // Match current playback position to a transcript time window.
    return transcript.find(
      (sentence) =>
        playedSeconds >= sentence.start_time && playedSeconds < sentence.end_time
    );
  }, [playedSeconds, transcript]);
  const currentSentenceId = currentSentence?.id;
  const isPortraitVideo = videoOrientation === 'portrait';
  const isSquareVideo = videoOrientation === 'square';

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
    if (fullscreenMode === 'none') {
      setActiveWordKey(null);
    }
  }, [fullscreenMode]);

  useEffect(() => {
    // Reset interactive subtitle selection when sentence changes to avoid stale DOM anchors.
    setActiveWordKey(null);
  }, [currentSentenceId]);

  const handleSeek = (seconds: number) => {
    // Jump video playback when a transcript sentence is clicked.
    playerRef.current?.seekTo(seconds, 'seconds');
    setPlayedSeconds(seconds);
  };

  const fetchTranslation = async (
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
  };

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
      if (fullscreenMode === 'none') {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
          return;
        }
        if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
        }
        return;
      }

      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
        return;
      }
      if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Prevent fullscreen API rejections from crashing the video page.
    }
  };

  const handleWordClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    word: string,
    tokenKey: string
  ) => {
    event.stopPropagation();
    setActivePhrase(null);

    if (activeWordKey === tokenKey) {
      setActiveWordKey(null);
      return;
    }

    setActiveWordKey(tokenKey);

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
    event: React.MouseEvent<HTMLButtonElement>,
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

  const handleToggleSentenceSave = async (
    event: React.MouseEvent<HTMLButtonElement>,
    sentence: TranscriptSentence
  ) => {
    event.stopPropagation();

    const normalized = normalizePhrase(sentence.text);
    if (!normalized) {
      return;
    }

    const key = `${video.id}:${normalized}`;
    const wasSaved = savedWordsSet.has(key);
    let translation = phraseTranslations[normalized];

    if (!wasSaved && !translation) {
      setLoadingSentenceId(sentence.id);

      try {
        translation = await fetchTranslation({ text: sentence.text });
      } catch {
        translation = 'translation unavailable';
      } finally {
        setLoadingSentenceId(null);
      }

      setPhraseTranslations((previous) => ({
        ...previous,
        [normalized]: translation ?? 'translation unavailable'
      }));
    }

    const result = toggleSavedWord({
      word: sentence.text,
      normalizedWord: normalized,
      translation: translation ?? 'translation unavailable',
      sentence: sentence.text,
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
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:gap-6">
      <div className="space-y-3 sm:space-y-4">
        <div
          ref={playerViewportRef}
          className={cn(
            'relative overflow-hidden rounded-xl border border-border/80 bg-panel sm:rounded-2xl',
            fullscreenMode === 'container' &&
              'h-[100dvh] w-[100dvw] rounded-none border-0 bg-black'
          )}
        >
          <div
            className={cn(
              'bg-black',
              fullscreenMode === 'none' &&
                (isPortraitVideo
                  ? 'mx-auto w-full max-w-[25rem]'
                  : isSquareVideo
                    ? 'mx-auto w-full max-w-[40rem]'
                    : 'w-full'),
              fullscreenMode === 'container' && 'flex h-full w-full items-center'
            )}
            style={
              fullscreenMode === 'none'
                ? { aspectRatio: String(videoAspectRatio) }
                : undefined
            }
          >
            <ReactPlayer
              ref={playerRef}
              width="100%"
              height="100%"
              controls
              playing
              muted
              playsinline
              playbackRate={playbackRate}
              url={getPlayableVideoUrl(video.video_url)}
              onReady={() => setIsPlayerReady(true)}
              config={playerConfig}
              onProgress={({ playedSeconds: seconds }) => setPlayedSeconds(seconds)}
            />
          </div>
          {fullscreenMode === 'container' && currentSentence ? (
            <div
              key={currentSentence.id}
              className={cn(
                'pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 px-4 text-center sm:px-6',
                isPortraitVideo
                  ? 'bottom-28 w-[min(92%,620px)]'
                  : 'bottom-20 w-[min(94%,1100px)] md:bottom-24'
              )}
            >
              <div
                className={cn(
                  'inline rounded-md bg-black/58 px-4 py-3 font-black leading-[1.18] text-white',
                  isPortraitVideo
                    ? 'text-[clamp(1.25rem,4.2vw,2.35rem)]'
                    : 'text-[clamp(1.75rem,3.4vw,3.3rem)]'
                )}
              >
                {tokenizeSentence(currentSentence.text).map((token, index) => {
                  const normalized = normalizeWord(token);
                  const isWord = normalized.length > 0;
                  const tokenKey = `fullscreen-${currentSentence.id}-${index}`;
                  const isWordActive = activeWordKey === tokenKey;
                  const translation = wordTranslations[normalized];
                  const isWordSaved = savedWordsSet.has(`${video.id}:${normalized}`);

                  if (!isWord) {
                    return (
                      <span key={tokenKey} className="whitespace-pre">
                        {token}
                      </span>
                    );
                  }

                  return (
                    <span key={tokenKey} className="pointer-events-auto relative inline-block">
                      <button
                        className={cn(
                          'inline rounded-md px-1.5 py-0.5 transition',
                          isWordActive
                            ? 'bg-[#ff7a00] text-white'
                            : 'text-white hover:bg-white/20'
                        )}
                        onClick={(event) => handleWordClick(event, token, tokenKey)}
                        type="button"
                      >
                        {token}
                      </button>
                      {isWordActive ? (
                        <div className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 flex-col gap-1 whitespace-nowrap rounded-xl border border-black/10 bg-white px-4 py-2 text-left">
                          <span className="text-lg font-semibold text-[#ff7a00]">{token}</span>
                          <span className="text-xl font-semibold text-slate-900">
                            {loadingWordKey === tokenKey
                              ? '...'
                              : (translation ?? 'translation unavailable')}
                          </span>
                          <button
                            type="button"
                            className={cn(
                              'inline-flex w-fit items-center justify-center rounded-md border p-1.5 transition',
                              isWordSaved
                                ? 'border-warm bg-warm/15 text-warm'
                                : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                            )}
                            onClick={(event) =>
                              handleSaveWordForLater(event, {
                                token,
                                normalized,
                                sentence: currentSentence.text
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
                        </div>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/80 bg-panel p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-semibold text-muted">
              <Gauge className="h-4 w-4 text-accent" />
              <span>Playback Speed</span>
            </div>
            <button
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition',
                fullscreenMode === 'none'
                  ? 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
                  : 'border-accent bg-accent/12 text-accent'
              )}
              onClick={() => {
                void toggleContainerFullscreen();
              }}
              type="button"
              aria-label={
                fullscreenMode === 'none'
                  ? 'Enter interactive fullscreen'
                  : 'Exit interactive fullscreen'
              }
              title={
                fullscreenMode === 'none'
                  ? 'Enter interactive fullscreen'
                  : 'Exit interactive fullscreen'
              }
            >
              {fullscreenMode === 'none' ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {fullscreenMode === 'none' ? 'Fullscreen' : 'Exit'}
              </span>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                className={cn(
                  'h-10 rounded-xl border text-sm font-bold transition',
                  speed === playbackRate
                    ? 'border-accent bg-accent text-white'
                    : 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
                )}
                onClick={() => setPlaybackRate(speed)}
                type="button"
                aria-label={`Set speed to ${speed}x`}
                aria-pressed={speed === playbackRate}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="rounded-xl border border-border/80 bg-panel p-4 sm:rounded-2xl sm:p-5 lg:max-h-[70vh] lg:overflow-y-auto">
        <h2 className="mb-4 text-2xl font-bold text-ink">Transcript</h2>
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted sm:text-xs">
          Click a word or highlight a phrase to translate.
        </p>

        <div className="space-y-2.5">
          {transcript.length === 0 ? (
            <p className="rounded-xl border border-border/80 bg-surface p-4 text-sm text-muted">
              Transcript is not available yet for this video.
            </p>
          ) : null}
          {transcript.map((sentence) => {
            const isActive = sentence.id === currentSentenceId;
            const sentenceNormalized = normalizePhrase(sentence.text);
            const sentenceSaveKey = `${video.id}:${sentenceNormalized}`;
            const isSaved = sentenceNormalized
              ? savedWordsSet.has(sentenceSaveKey)
              : false;
            const isSentenceLoading = loadingSentenceId === sentence.id;
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
                  <p className="text-xs font-bold text-muted sm:text-sm">
                    {formatSeconds(sentence.start_time)} -{' '}
                    {formatSeconds(sentence.end_time)}
                  </p>
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
                </div>

                <button
                  className={cn(
                    'mt-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border transition',
                    isSaved
                      ? 'border-warm bg-warm/15 text-warm'
                      : 'border-border/80 bg-panel text-muted hover:border-accent hover:text-accent',
                    isSentenceLoading ? 'cursor-not-allowed opacity-60' : ''
                  )}
                  onClick={(event) => {
                    void handleToggleSentenceSave(event, sentence);
                  }}
                  type="button"
                  disabled={isSentenceLoading}
                  aria-label={isSaved ? 'Unsave sentence vocabulary' : 'Save sentence vocabulary'}
                  title={isSaved ? 'Unsave sentence vocabulary' : 'Save sentence vocabulary'}
                >
                  <Bookmark className={cn('h-4 w-4', isSaved ? 'fill-current' : '')} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
