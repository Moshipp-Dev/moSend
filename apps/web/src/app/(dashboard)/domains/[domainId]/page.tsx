"use client";

import { api } from "~/trpc/react";
import { DomainStatus } from "@prisma/client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@usesend/ui/src/breadcrumb";
import { DomainStatusBadge } from "../domain-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import React, { use } from "react";
import { Switch } from "@usesend/ui/src/switch";
import DeleteDomain from "./delete-domain";
import SendTestMail from "./send-test-mail";
import { Button } from "@usesend/ui/src/button";
import Link from "next/link";
import { toast } from "@usesend/ui/src/toaster";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DomainResponse = NonNullable<RouterOutputs["domain"]["getDomain"]>;

export default function DomainItemPage({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = use(params);

  const domainQuery = api.domain.getDomain.useQuery(
    {
      id: Number(domainId),
    },
    {
      refetchInterval: (q) => (q?.state.data?.isVerifying ? 10000 : false),
      refetchIntervalInBackground: true,
    },
  );

  const verifyQuery = api.domain.startVerification.useMutation();

  const handleVerify = () => {
    verifyQuery.mutate(
      { id: Number(domainId) },
      {
        onSettled: () => {
          domainQuery.refetch();
        },
      },
    );
  };

  return (
    <div>
      {domainQuery.isLoading ? (
        <p>Cargando...</p>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center  gap-4">
              {/* <div className="flex items-center gap-4">
              <H1>{domainQuery.data?.name}</H1>
            </div> */}
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/domains" className="text-lg">
                        Dominios
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-lg" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-lg ">
                      {domainQuery.data?.name}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="">
                <DomainStatusBadge
                  status={domainQuery.data?.status || DomainStatus.NOT_STARTED}
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <Button variant="outline" onClick={handleVerify}>
                  {domainQuery.data?.isVerifying
                    ? "Verificando..."
                    : domainQuery.data?.status === DomainStatus.SUCCESS
                      ? "Verificar de nuevo"
                      : "Verificar dominio"}
                </Button>
              </div>
              {domainQuery.data ? (
                <SendTestMail domain={domainQuery.data} />
              ) : null}
            </div>
          </div>

          <div className=" border rounded-lg p-4 shadow">
            <p className="font-semibold text-xl">Registros DNS</p>
            <Table className="mt-2">
              <TableHeader className="">
                <TableRow className="">
                  <TableHead className="rounded-tl-xl">Tipo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contenido</TableHead>
                  <TableHead className="">TTL</TableHead>
                  <TableHead className="">Prioridad</TableHead>
                  <TableHead className="rounded-tr-xl">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(domainQuery.data?.dnsRecords ?? []).map((record) => {
                  const key = `${record.type}-${record.name}`;
                  const valueClassName = record.name.includes("_domainkey")
                    ? "w-[200px] overflow-hidden text-ellipsis"
                    : "w-[200px] overflow-hidden text-ellipsis text-nowrap";

                  return (
                    <TableRow key={key}>
                      <TableCell className="">{record.type}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 items-center">
                          {record.recommended ? (
                            <span className="text-sm text-muted-foreground">
                              (recomendado)
                            </span>
                          ) : null}
                          <TextWithCopyButton value={record.name} />
                        </div>
                      </TableCell>
                      <TableCell className="">
                        <TextWithCopyButton
                          value={record.value}
                          className={valueClassName}
                        />
                      </TableCell>
                      <TableCell className="">{record.ttl}</TableCell>
                      <TableCell className="">{record.priority ?? ""}</TableCell>
                      <TableCell className="">
                        <DnsVerificationStatus status={record.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {domainQuery.data ? (
            <DomainSettings domain={domainQuery.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}

const DomainSettings: React.FC<{ domain: DomainResponse }> = ({ domain }) => {
  const updateDomain = api.domain.updateDomain.useMutation();
  const utils = api.useUtils();

  const [clickTracking, setClickTracking] = React.useState(
    domain.clickTracking,
  );
  const [openTracking, setOpenTracking] = React.useState(domain.openTracking);

  function handleClickTrackingChange() {
    setClickTracking(!clickTracking);
    updateDomain.mutate(
      { id: domain.id, clickTracking: !clickTracking },
      {
        onSuccess: () => {
          utils.domain.invalidate();
          toast.success("Seguimiento de clics actualizado");
        },
      },
    );
  }

  function handleOpenTrackingChange() {
    setOpenTracking(!openTracking);
    updateDomain.mutate(
      { id: domain.id, openTracking: !openTracking },
      {
        onSuccess: () => {
          utils.domain.invalidate();
          toast.success("Seguimiento de apertura actualizado");
        },
      },
    );
  }
  return (
    <div className="rounded-lg shadow p-4 border flex flex-col gap-6">
      <p className="font-semibold text-xl">Configuración</p>
      <div className="flex flex-col gap-1">
        <div className="font-semibold">Seguimiento de clics</div>
        <p className=" text-muted-foreground text-sm">
          Rastrea cualquier enlace en el contenido de tus correos.{" "}
        </p>
        <Switch
          checked={clickTracking}
          onCheckedChange={handleClickTrackingChange}
          className="data-[state=checked]:bg-success"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-semibold">Seguimiento de apertura</div>
        <p className=" text-muted-foreground text-sm">
          Unsend agrega un píxel de seguimiento a cada correo que envías. Esto
          te permite ver cuántas personas abren tus correos. Esto puede afectar
          la tasa de entrega de tus correos.
        </p>
        <Switch
          checked={openTracking}
          onCheckedChange={handleOpenTrackingChange}
          className="data-[state=checked]:bg-success"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semibold text-lg text-destructive">Peligro</p>

        <p className="text-destructive text-sm font-semibold">
          Eliminar un dominio detendrá el envío de correos con este dominio.
        </p>
        <DeleteDomain domain={domain} />
      </div>
    </div>
  );
};

const DnsVerificationStatus: React.FC<{ status: DomainStatus }> = ({ status }) => {
  let badgeColor = "bg-gray/10 text-gray border-gray/10"; // Default color
  switch (status) {
    case DomainStatus.SUCCESS:
      badgeColor = "bg-green/15 text-green border border-green/25";
      break;
    case DomainStatus.FAILED:
      badgeColor = "bg-red/10 text-red border border-red/10";
      break;
    case DomainStatus.TEMPORARY_FAILURE:
    case DomainStatus.PENDING:
      badgeColor = "bg-yellow/20 text-yellow border border-yellow/10";
      break;
    default:
      badgeColor = "bg-gray/10 text-gray border border-gray/20";
  }

  return (
    <div
      className={` text-xs text-center min-w-[70px] capitalize rounded-md py-1 justify-center flex items-center ${badgeColor}`}
    >
      {status.split("_").join(" ").toLowerCase()}
    </div>
  );
};
