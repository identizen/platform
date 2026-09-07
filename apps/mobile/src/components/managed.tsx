/** Presentational bits shared by Home, Settings and the enrollment screen. */
import { Building2 } from 'lucide-react-native';
import { Text, View } from 'react-native';
import type { ManagedBy, PendingEnrollment } from '../identity/store';
import { useBrandColor } from './brand';
import { Button, Card, Muted } from './ui';

/** One line under the identity: "Managed by Acme". */
export function ManagedByLine({ managedBy }: { managedBy: ManagedBy }) {
  const muted = useBrandColor('muted');
  return (
    <View className="flex-row items-center gap-1.5" testID="managed-by">
      <Building2 size={14} color={muted} />
      <Muted>Managed by {managedBy.org}</Muted>
    </View>
  );
}

/** The Settings card: who manages the phone, on which index, and what that means. */
export function ManagedByCard({ managedBy }: { managedBy: ManagedBy }) {
  return (
    <Card>
      <Text className="font-medium text-base text-fg dark:text-fg-dark">
        Managed by {managedBy.org}
      </Text>
      <Text
        className="font-mono text-xs text-fg-muted dark:text-fg-muted-dark"
        testID="managed-index"
      >
        {managedBy.index}
      </Text>
      <Muted>
        {managedBy.org} can disable or remove this phone and see your sign-in activity. They never
        get your keys.
      </Muted>
    </Card>
  );
}

/** Home card for an enrollment an administrator has not decided on yet. */
export function PendingEnrollmentCard({
  pending,
  onCheck,
}: {
  pending: PendingEnrollment;
  onCheck: () => void;
}) {
  return (
    <Card tone="accent">
      <Text className="font-semibold text-base text-fg dark:text-fg-dark">
        Waiting for {pending.org} to approve this phone
      </Text>
      <Muted>You will be able to use it for {pending.org} once an administrator approves it.</Muted>
      <Button
        label="Check status"
        variant="secondary"
        onPress={onCheck}
        testID="check-enrollment"
      />
    </Card>
  );
}
