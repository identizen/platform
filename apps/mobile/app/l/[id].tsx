import { Redirect, useLocalSearchParams } from 'expo-router';
import { parseChallengeId } from '../../src/challenges/receive';
import { normalizeIndexUrl } from '../../src/enrollment/links';

/**
 * Universal link / custom scheme landing: `/l/<challenge_id>[?index=<issuer>]` -> approve screen.
 * The index, when the link names one, rides along so the approve screen fetches from it; without
 * it the app asks each registered index for the id.
 */
export default function DeepLink() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const challengeId = parseChallengeId(id ?? '');
  if (!challengeId) return <Redirect href="/home" />;
  const indexUrl = index ? normalizeIndexUrl(index) : null;
  return (
    <Redirect
      href={{
        pathname: '/approve/[id]',
        params: indexUrl ? { id: challengeId, index: indexUrl } : { id: challengeId },
      }}
    />
  );
}
