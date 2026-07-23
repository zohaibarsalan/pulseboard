import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { diagnoseDelivery, type DiagnosableDelivery } from "../../shared/deliveryDiagnostics.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DeliveryDiagnostic({
  delivery,
  showSuccess = false,
}: {
  delivery: DiagnosableDelivery;
  showSuccess?: boolean;
}): React.ReactElement | null {
  const diagnosis = diagnoseDelivery(delivery);
  if (diagnosis.severity === "success" && !showSuccess) return null;

  const Icon =
    diagnosis.severity === "success"
      ? CheckCircle2
      : diagnosis.severity === "error"
        ? AlertCircle
        : diagnosis.severity === "warning"
          ? TriangleAlert
          : Info;
  const variant =
    diagnosis.severity === "success"
      ? "success"
      : diagnosis.severity === "error"
        ? "error"
        : diagnosis.severity === "warning"
          ? "warning"
          : "info";

  return (
    <Alert variant={variant}>
      <Icon />
      <AlertTitle>{diagnosis.title}</AlertTitle>
      <AlertDescription>
        <span>{diagnosis.summary}</span>
        {diagnosis.action && <span><strong className="font-medium text-foreground">Next:</strong> {diagnosis.action}</span>}
      </AlertDescription>
    </Alert>
  );
}
