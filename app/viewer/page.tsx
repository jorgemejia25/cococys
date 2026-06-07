import { Suspense } from "react";
import { PresentationViewer } from "@/components/presentation-viewer";

/**
 * Viewer route — /viewer?course=<id>
 *
 * Wraps the client viewer in a Suspense boundary so that useSearchParams()
 * inside PresentationViewer does not trigger a CSR bailout on the parent tree.
 */
export default function ViewerPage() {
  return (
    <Suspense>
      <PresentationViewer />
    </Suspense>
  );
}
