from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(
        self,
        username,
        password=None,
        email=None,
        **extra_fields
    ):
        if not username:
            raise ValueError(
                "El nombre de usuario es obligatorio."
            )

        username = username.strip()

        if email:
            email = self.normalize_email(email)
        else:
            email = None

        user = self.model(
            username=username,
            email=email,
            **extra_fields
        )

        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(
        self,
        username,
        password=None,
        email=None,
        **extra_fields
    ):
        extra_fields.setdefault(
            "is_staff",
            True
        )

        extra_fields.setdefault(
            "is_superuser",
            True
        )

        extra_fields.setdefault(
            "is_active",
            True
        )

        extra_fields.setdefault(
            "role",
            User.Role.ADMINISTRADOR
        )

        if extra_fields.get("is_staff") is not True:
            raise ValueError(
                "El superusuario debe tener is_staff=True."
            )

        if extra_fields.get("is_superuser") is not True:
            raise ValueError(
                "El superusuario debe tener is_superuser=True."
            )

        return self.create_user(
            username=username,
            password=password,
            email=email,
            **extra_fields
        )


class User(AbstractUser):
    """
    Usuario personalizado del Sistema Clínico.

    El nombre de usuario se utiliza para iniciar sesión.
    El correo electrónico es opcional.
    """

    class Role(models.TextChoices):
        ADMINISTRADOR = (
            "ADMINISTRADOR",
            "Administrador"
        )
        RECEPCIONISTA = (
            "RECEPCIONISTA",
            "Recepcionista"
        )
        ODONTOLOGO = (
            "ODONTOLOGO",
            "Odontólogo"
        )

    email = models.EmailField(
        "correo electrónico",
        unique=True,
        blank=True,
        null=True
    )

    role = models.CharField(
        "rol",
        max_length=20,
        choices=Role.choices
    )

    USERNAME_FIELD = "username"

    REQUIRED_FIELDS = []

    objects = UserManager()

    def save(self, *args, **kwargs):
        if not self.email:
            self.email = None

        super().save(*args, **kwargs)

    def __str__(self):
        return self.username