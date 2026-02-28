import type { LearnerContactType } from '@/types/database';

export interface LearnerClientProfile {
  learnerKey: string;
  contactType?: LearnerContactType;
  contactValue?: string;
}

const LEARNER_PROFILE_STORAGE_KEY = 'xlang_learner_profile';
export const LEARNER_PROFILE_UPDATED_EVENT = 'xlang:learner-profile-updated';

function createLearnerKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `learner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseStoredProfile(): LearnerClientProfile | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LEARNER_PROFILE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<LearnerClientProfile>;
    if (!parsed || typeof parsed.learnerKey !== 'string' || !parsed.learnerKey.trim()) {
      return null;
    }

    return {
      learnerKey: parsed.learnerKey.trim(),
      contactType: parsed.contactType === 'email' || parsed.contactType === 'whatsapp'
        ? parsed.contactType
        : undefined,
      contactValue:
        typeof parsed.contactValue === 'string' && parsed.contactValue.trim().length > 0
          ? parsed.contactValue.trim()
          : undefined
    };
  } catch {
    return null;
  }
}

function persistProfile(profile: LearnerClientProfile) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LEARNER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(
    new CustomEvent<{ profile: LearnerClientProfile }>(LEARNER_PROFILE_UPDATED_EVENT, {
      detail: { profile }
    })
  );
}

export function getLearnerProfile(): LearnerClientProfile {
  const existing = parseStoredProfile();
  if (existing) {
    return existing;
  }

  const profile: LearnerClientProfile = { learnerKey: createLearnerKey() };
  persistProfile(profile);
  return profile;
}

export function getLearnerKey() {
  return getLearnerProfile().learnerKey;
}

export function updateLearnerContact(params: {
  contactType: LearnerContactType;
  contactValue: string;
}) {
  const profile = getLearnerProfile();
  const next: LearnerClientProfile = {
    ...profile,
    contactType: params.contactType,
    contactValue: params.contactValue.trim()
  };
  persistProfile(next);
  return next;
}

export function setLearnerKey(learnerKey: string) {
  const trimmed = learnerKey.trim();
  if (!trimmed) {
    return null;
  }

  const next: LearnerClientProfile = {
    learnerKey: trimmed
  };
  persistProfile(next);
  return next;
}

export function clearLearnerContact() {
  const profile = getLearnerProfile();
  const next: LearnerClientProfile = { learnerKey: profile.learnerKey };
  persistProfile(next);
  return next;
}
