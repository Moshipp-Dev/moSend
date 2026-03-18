"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { SuppressionReason } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import { Button } from "@usesend/ui/src/button";
import { Label } from "@usesend/ui/src/label";
import { Textarea } from "@usesend/ui/src/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import { Upload, FileText } from "lucide-react";

interface BulkAddSuppressionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkAddSuppressionsDialog({
  open,
  onOpenChange,
}: BulkAddSuppressionsDialogProps) {
  const [emails, setEmails] = useState("");
  const [reason, setReason] = useState<SuppressionReason>(
    SuppressionReason.MANUAL
  );
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const utils = api.useUtils();

  const bulkAddMutation = api.suppression.bulkAddSuppressions.useMutation({
    onSuccess: (result) => {
      utils.suppression.getSuppressions.invalidate();
      utils.suppression.getSuppressionStats.invalidate();
      setProcessing(false);
      handleClose();
    },
    onError: (error) => {
      setError(error.message);
      setProcessing(false);
    },
  });

  const handleClose = () => {
    setEmails("");
    setReason(SuppressionReason.MANUAL);
    setError(null);
    setProcessing(false);
    onOpenChange(false);
  };

  const parseEmails = (text: string): string[] => {
    // Split by various delimiters and clean up
    const emailList = text
      .split(/[\n,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && email.includes("@"));

    // Remove duplicates
    return Array.from(new Set(emailList));
  };

  const validateEmails = (emailList: string[]): string[] => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailList.filter((email) => emailRegex.test(email));
  };

  const processFile = (file: File) => {
    // Validate file type
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".csv")) {
      setError("Por favor, sube un archivo .txt o .csv");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setEmails(text);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0]) {
      processFile(files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProcessing(true);

    if (!emails.trim()) {
      setError("Por favor, ingresa direcciones de correo");
      setProcessing(false);
      return;
    }

    const emailList = parseEmails(emails);

    if (emailList.length === 0) {
      setError("No se encontraron direcciones de correo válidas");
      setProcessing(false);
      return;
    }

    const validEmails = validateEmails(emailList);

    if (validEmails.length === 0) {
      setError("No se encontraron direcciones de correo válidas");
      setProcessing(false);
      return;
    }

    if (validEmails.length > 1000) {
      setError("Se permiten máximo 1000 direcciones de correo por carga");
      setProcessing(false);
      return;
    }

    if (validEmails.length !== emailList.length) {
      const invalidCount = emailList.length - validEmails.length;
      setError(`${invalidCount} direcciones de correo inválidas serán omitidas`);
      // Continue processing with valid emails
    }

    try {
      await bulkAddMutation.mutateAsync({
        emails: validEmails,
        reason,
      });
    } catch (error) {
      setProcessing(false);
    }
  };

  const emailList = parseEmails(emails);
  const validEmails = validateEmails(emailList);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar supresiones en masa</DialogTitle>
          <DialogDescription>
            Agrega múltiples direcciones de correo a la lista de supresión a la vez.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">
                <FileText className="h-4 w-4 mr-2" />
                Texto
              </TabsTrigger>
              <TabsTrigger value="file">
                <Upload className="h-4 w-4 mr-2" />
                Subir archivo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emails">Direcciones de correo</Label>
                <Textarea
                  id="emails"
                  placeholder="Ingresa las direcciones de correo separadas por comas, puntos y coma o saltos de línea:&#10;ejemplo1@dominio.com&#10;ejemplo2@dominio.com&#10;ejemplo3@dominio.com"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  className="min-h-[120px]"
                  disabled={processing}
                />
              </div>
            </TabsContent>

            <TabsContent value="file" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Subir archivo</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    id="file"
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={processing}
                  />
                  <div className="text-center">
                    <Upload
                      className={`mx-auto h-12 w-12 ${
                        isDragOver ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("file")?.click()}
                        disabled={processing}
                      >
                        Elegir archivo
                      </Button>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isDragOver
                        ? "Suelta tu archivo aquí"
                        : "Sube un archivo .txt o .csv con direcciones de correo o arrástralo aquí"}
                    </p>
                  </div>
                </div>
                {emails && (
                  <Textarea
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    className="min-h-[120px]"
                    disabled={processing}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as SuppressionReason)}
              disabled={processing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="HARD_BOUNCE">Rebote duro</SelectItem>
                <SelectItem value="COMPLAINT">Queja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {emailList.length > 0 && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              <div>Se encontraron {emailList.length} direcciones de correo</div>
              <div>Válidas: {validEmails.length}</div>
              {validEmails.length !== emailList.length && (
                <div className="text-orange-600">
                  Inválidas: {emailList.length - validEmails.length}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={processing}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={processing || validEmails.length === 0}
            >
              {processing
                ? "Agregando..."
                : `Agregar ${validEmails.length} supresiones`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
