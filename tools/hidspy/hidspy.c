// Logs all HID traffic of the host process (DYLD_INSERT_LIBRARIES interposer).
#include <IOKit/hid/IOHIDDevice.h>
#include <IOKit/hid/IOHIDManager.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>
#include <pthread.h>

static FILE *logf_;
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;

static void logline(const char *dir, uint32_t type, CFIndex id, const uint8_t *buf, CFIndex len, long ret) {
  pthread_mutex_lock(&mu);
  if (!logf_) {
    const char *p = getenv("HIDSPY_LOG");
    logf_ = fopen(p ? p : "/tmp/hidspy.log", "a");
    setvbuf(logf_, NULL, _IOLBF, 0);
  }
  struct timeval tv; gettimeofday(&tv, NULL);
  fprintf(logf_, "%ld.%03d %s type=%u id=%ld len=%ld ret=%lx :", (long)tv.tv_sec, (int)(tv.tv_usec / 1000), dir, type, (long)id, (long)len, ret);
  for (CFIndex i = 0; i < len; i++) fprintf(logf_, " %02x", buf[i]);
  fprintf(logf_, "\n");
  pthread_mutex_unlock(&mu);
}

static IOReturn my_SetReport(IOHIDDeviceRef d, IOHIDReportType t, CFIndex id, const uint8_t *r, CFIndex len) {
  IOReturn ret = IOHIDDeviceSetReport(d, t, id, r, len);
  logline("OUT", t, id, r, len, ret);
  return ret;
}

static IOReturn my_GetReport(IOHIDDeviceRef d, IOHIDReportType t, CFIndex id, uint8_t *r, CFIndex *len) {
  IOReturn ret = IOHIDDeviceGetReport(d, t, id, r, len);
  logline("GET", t, id, r, len ? *len : 0, ret);
  return ret;
}

typedef struct { IOHIDReportCallback cb; void *ctx; } wrap_t;
static void my_cb(void *ctx, IOReturn res, void *sender, IOHIDReportType t, uint32_t id, uint8_t *r, CFIndex len) {
  wrap_t *w = ctx;
  logline("IN ", t, id, r, len, res);
  w->cb(w->ctx, res, sender, t, id, r, len);
}

static void my_RegisterInput(IOHIDDeviceRef d, uint8_t *report, CFIndex len, IOHIDReportCallback cb, void *ctx) {
  wrap_t *w = malloc(sizeof *w); w->cb = cb; w->ctx = ctx;
  IOHIDDeviceRegisterInputReportCallback(d, report, len, cb ? my_cb : NULL, w);
}

static IOHIDDeviceRef my_Create(CFAllocatorRef a, io_service_t s) {
  IOHIDDeviceRef d = IOHIDDeviceCreate(a, s);
  if (d) {
    CFNumberRef v = IOHIDDeviceGetProperty(d, CFSTR(kIOHIDVendorIDKey));
    CFNumberRef p = IOHIDDeviceGetProperty(d, CFSTR(kIOHIDProductIDKey));
    CFNumberRef in = IOHIDDeviceGetProperty(d, CFSTR(kIOHIDMaxInputReportSizeKey));
    CFNumberRef out = IOHIDDeviceGetProperty(d, CFSTR(kIOHIDMaxOutputReportSizeKey));
    CFNumberRef up = IOHIDDeviceGetProperty(d, CFSTR(kIOHIDPrimaryUsagePageKey));
    int vi = 0, pi = 0, ii = 0, oi = 0, ui = 0;
    if (v) CFNumberGetValue(v, kCFNumberIntType, &vi);
    if (p) CFNumberGetValue(p, kCFNumberIntType, &pi);
    if (in) CFNumberGetValue(in, kCFNumberIntType, &ii);
    if (out) CFNumberGetValue(out, kCFNumberIntType, &oi);
    if (up) CFNumberGetValue(up, kCFNumberIntType, &ui);
    char msg[160];
    snprintf(msg, sizeof msg, "DEV vid=%04x pid=%04x in=%d out=%d usagePage=%04x", vi, pi, ii, oi, ui);
    logline(msg, 0, 0, NULL, 0, 0);
  }
  return d;
}

#define INTERPOSE(n, o) __attribute__((used)) static struct { const void *r; const void *o; } _i_##o \
  __attribute__((section("__DATA,__interpose"))) = { (const void *)n, (const void *)o };
INTERPOSE(my_SetReport, IOHIDDeviceSetReport)
INTERPOSE(my_GetReport, IOHIDDeviceGetReport)
INTERPOSE(my_RegisterInput, IOHIDDeviceRegisterInputReportCallback)
INTERPOSE(my_Create, IOHIDDeviceCreate)
