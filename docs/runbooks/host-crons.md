---
summary: systemd timers en whisper que reemplazan los crons que vivían en Vercel.
audience: cualquier agente que toque `infra/systemd/` o `vercel.json`
read_when: añadir / mover / depurar un cron de host
---

# Host crons (systemd timers en whisper)

Vercel está pausado desde 2026-05-03 (`docs/state-of-the-world.md`). Los crons declarados
en `vercel.json` no los ejecuta nadie automáticamente. Este runbook describe cómo se
reemplazaron por systemd timers en el nodo `whisper`.

## Modelo

- **Una unit por cron.** Naming: `raizdirecta-<slug>.service` + `raizdirecta-<slug>.timer`.
- **Auth común:** todas leen `Bearer ${CRON_SECRET}` desde `/etc/raizdirecta/host-cron.env`
  (mode 600). Es el mismo `CRON_SECRET` que el contenedor `marketplaceprod_app_*`.
- **Failure path:** cada `.service` declara `OnFailure=raizdirecta-host-cron-failed@%n.service`,
  un template unit que opcionalmente postea a Healthchecks.io (`HC_PING_FAILURE`).
- **Persistent timers:** `Persistent=true` para que un cron que se perdió mientras
  whisper estaba apagado se ejecute al volver. Aplica al deploy single-node.

## Crons activos

| Slug                     | Schedule (UTC) | Endpoint                                        | Notas |
|--------------------------|----------------|-------------------------------------------------|-------|
| `cleanup-idempotency`    | `03:00`        | `https://raizdirecta.es/api/cron/cleanup-idempotency` | Sweep diario de `IdempotencyKey` expirados (#1307). |

## Instalar / actualizar

```bash
# desde el repo en whisper (un worktree limpio)
sudo bash infra/systemd/install-host-crons.sh
```

El script:

1. Copia los `*.service` y `*.timer` a `/etc/systemd/system/` (mode 644, owner root).
2. `systemctl daemon-reload`.
3. `systemctl enable --now <timer>` (idempotente).
4. Avisa si `/etc/raizdirecta/host-cron.env` no existe — sin ese fichero el cron
   correrá pero recibirá 401 del endpoint.

## Provisionar el env file (una vez)

```bash
sudo install -d -m 700 /etc/raizdirecta
sudo install -m 600 -o root -g root /dev/null /etc/raizdirecta/host-cron.env
sudo tee /etc/raizdirecta/host-cron.env >/dev/null <<EOF
CRON_SECRET=<el mismo que .env.production>
# Healthchecks.io (opcional, deja vacío para desactivar):
HC_PING_CLEANUP_IDEMPOTENCY=
HC_PING_FAILURE=
EOF
```

## Verificar

```bash
# Timer encolado y próximo disparo
systemctl list-timers raizdirecta-* --all

# Smoke test inmediato (no espera al siguiente disparo)
sudo systemctl start raizdirecta-cleanup-idempotency.service
sudo journalctl -u raizdirecta-cleanup-idempotency.service -n 20 --no-pager
# Esperado: HTTP 200 + JSON {"ok":true,"deleted":N,"durationMs":...}
```

## Añadir un nuevo cron

1. Crear `infra/systemd/raizdirecta-<slug>.service` y `.timer` siguiendo el modelo del
   sweep de idempotency.
2. Añadirlo al array `units=(...)` en `infra/systemd/install-host-crons.sh`.
3. Añadir fila a la tabla "Crons activos" en este runbook.
4. Si reemplaza algo de `vercel.json`, **borrar la entrada de `vercel.json` en el mismo PR**
   para que no haya doble fuente de verdad.

## Apagar / mover un cron

```bash
sudo systemctl disable --now raizdirecta-<slug>.timer
sudo rm /etc/systemd/system/raizdirecta-<slug>.{service,timer}
sudo systemctl daemon-reload
```

Y borrar la unit de `infra/systemd/` + del array de `install-host-crons.sh` + de la tabla.

## Por qué systemd y no cron(8)

- `Persistent=true` resuelve el caso "el laptop se apagó" sin ningún workaround manual
  (anacron en Debian/Ubuntu existe pero requiere reglas separadas; systemd lo da gratis).
- `journalctl -u <unit>` da histórico unificado por unidad sin parsear `/var/log/syslog`.
- `OnFailure=` permite encadenar la alerta sin tocar el cuerpo del cron.
- El template `@.service` para failures se reusa en cualquier futuro cron.

## Por qué no Vercel reactivado

Reactivar Vercel sólo para los crons sumaría una dependencia externa que hoy no
contribuye al deploy (`docs/state-of-the-world.md` § Integraciones externas). Mientras
producción corra en whisper, los crons también — un único punto de operación.
