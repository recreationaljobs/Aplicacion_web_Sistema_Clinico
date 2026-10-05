FROM python:3.13.15-slim-bookworm@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    PORT=8000

WORKDIR /app

COPY requirements.txt requirements.lock ./

RUN python -m pip install --no-cache-dir -r requirements.lock

RUN groupadd --gid 10001 dentalclinic \
    && useradd \
        --uid 10001 \
        --gid dentalclinic \
        --no-create-home \
        --shell /usr/sbin/nologin \
        dentalclinic

COPY --chown=dentalclinic:dentalclinic . .

RUN chmod +x /app/start.sh \
    && chown -R dentalclinic:dentalclinic /app

USER 10001:10001

RUN DJANGO_SETTINGS_MODULE=config.settings.build \
    python manage.py collectstatic --noinput

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request; port=os.getenv('PORT','8000'); host=(os.getenv('HEALTHCHECK_HOST') or os.environ['ALLOWED_HOSTS'].split(',')[0]).strip().lstrip('.'); request=urllib.request.Request(f'http://127.0.0.1:{port}/health/live/',headers={'Host':host,'X-Forwarded-Proto':'https'}); urllib.request.urlopen(request,timeout=3).read()"]

CMD ["/app/start.sh"]