import { Redirect, useLocalSearchParams } from 'expo-router';
import { parseChallengeId } from '../../src/challenges/receive';

/** Universal link / custom scheme landing: `/l/<challenge_id>` -> approve screen. */
export default function DeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = parseChallengeId(id ?? '');
  if (!challengeId) return <Redirect href="/home" />;
  return <Redirect href={{ pathname: '/approve/[id]', params: { id: challengeId } }} />;
}
