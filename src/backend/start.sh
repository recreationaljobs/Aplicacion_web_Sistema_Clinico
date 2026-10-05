#!/bin/sh
set -e

echo "========================================"
echo "Aplicando migraciones de Django..."
echo "========================================"

python manage.py migrate --noinput

echo "========================================"
echo "Migraciones aplicadas."
echo "Iniciando Gunicorn en puerto ${PORT:-8000}..."
echo "========================================"

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers ${WEB_CONCURRENCY:-1} \
    --access-logfile - \
    --error-logfile -