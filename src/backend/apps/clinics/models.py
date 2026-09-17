from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class ClinicProfile(models.Model):
    class Currency(models.TextChoices):
        NIO = "NIO", "Córdoba nicaragüense (C$)"
        USD = "USD", "Dólar estadounidense ($)"

    name = models.CharField(max_length=150, default="DentalClinic")
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to="clinics/logos/", blank=True)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.NIO)
    timezone = models.CharField(max_length=64, default="America/Managua")
    schedule_configured = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        profile, _ = cls.objects.get_or_create(pk=1)
        return profile


class BusinessHour(models.Model):
    class Weekday(models.IntegerChoices):
        MONDAY = 0, "Lunes"
        TUESDAY = 1, "Martes"
        WEDNESDAY = 2, "Miércoles"
        THURSDAY = 3, "Jueves"
        FRIDAY = 4, "Viernes"
        SATURDAY = 5, "Sábado"
        SUNDAY = 6, "Domingo"

    weekday = models.PositiveSmallIntegerField(unique=True, choices=Weekday.choices)
    is_open = models.BooleanField(default=False)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ("weekday",)


class BusinessBreak(models.Model):
    business_hour = models.ForeignKey(BusinessHour, related_name="breaks", on_delete=models.CASCADE)
    starts_at = models.TimeField()
    ends_at = models.TimeField()

    class Meta:
        ordering = ("starts_at",)


class HolidayClosure(models.Model):
    name = models.CharField(max_length=120)
    date = models.DateField()
    repeats_annually = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("date", "name")


class ServiceCategory(models.Model):
    name = models.CharField(max_length=120)
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("position", "name")


class ClinicService(models.Model):
    category = models.ForeignKey(ServiceCategory, related_name="services", on_delete=models.PROTECT)
    name = models.CharField(max_length=160)
    duration_minutes = models.PositiveSmallIntegerField(
        validators=(MinValueValidator(15), MaxValueValidator(240)),
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=(MinValueValidator(0),))
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("category__position", "position", "name")
        constraints = [models.CheckConstraint(condition=models.Q(price__gte=0), name="clinic_service_nonnegative_price")]
