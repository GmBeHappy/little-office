import { Suspense } from "react";
import NativeAuthorize from "@/components/NativeAuthorize";
export default function Page() {
  return (
    <Suspense fallback={<p>Connecting…</p>}>
      <NativeAuthorize />
    </Suspense>
  );
}
