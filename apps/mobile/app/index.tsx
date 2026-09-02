import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { hasIdentity } from '../src/identity/identity';

export default function Index() {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    void hasIdentity().then(setHas);
  }, []);
  if (has === null) return null;
  return <Redirect href={has ? '/home' : '/onboarding'} />;
}
