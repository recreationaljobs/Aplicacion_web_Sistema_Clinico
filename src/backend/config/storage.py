import logging

from botocore.exceptions import ClientError
from django.conf import settings
from storages.backends.s3 import S3Storage


logger = logging.getLogger(__name__)


class PublicMediaStorage(S3Storage):
    bucket_name = settings.AWS_STORAGE_BUCKET_NAME
    location = settings.AWS_PUBLIC_MEDIA_PREFIX
    default_acl = None
    file_overwrite = False
    querystring_auth = True

    def exists(self, name):
        try:
            return super().exists(name)
        except ClientError as exc:
            error = exc.response.get("Error", {})
            metadata = exc.response.get(
                "ResponseMetadata",
                {}
            )

            logger.exception(
                "S3 public storage error. "
                "code=%s message=%s http=%s "
                "bucket=%s region=%s endpoint=%s",
                error.get("Code"),
                error.get("Message"),
                metadata.get("HTTPStatusCode"),
                self.bucket_name,
                settings.AWS_S3_REGION_NAME,
                settings.AWS_S3_ENDPOINT_URL,
            )

            raise


class PrivateMediaStorage(S3Storage):
    bucket_name = settings.AWS_PRIVATE_STORAGE_BUCKET_NAME
    location = settings.AWS_PRIVATE_MEDIA_PREFIX
    default_acl = None
    file_overwrite = False
    querystring_auth = True
    querystring_expire = 60