# Cloud Modülü — Kullanım Rehberi

Bu doküman `Cloud` modülünün kullanımını, endpoint açıklamalarını ve örnek istek/yanıt akışlarını içerir. API Swagger dokümantasyonu controller üzerinde yer almaktadır (class üzerinde `@ApiTags('Cloud')` ve bütün endpointlerde `@ApiOperation`/`@ApiResponse` açıklamaları bulunmaktadır).

> Not: Tüm çağrılar kimlik doğrulaması gerektirir (Bearer token). Swagger UI üzerinden `Authorize` bölümünden token ekleyebilirsiniz.

---

## Kimlik Doğrulama (Login)

Cloud endpoint'lerini kullanabilmek için önce kimlik doğrulama (login) yaparak access token almanız gerekir. Aşağıda proje içindeki Authentication modulündeki login akışının kısa örneği yer almaktadır.

### POST /Authentication/Login
- Body:

```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

- Başarılı yanıt (örnek):

```json
{
  "accessToken": "eyJhbGciOiJI...",
  "refreshToken": "eyJhbGciOiJI...",
  "expiresIn": 3600
}
```

1) Login isteğini yaptıktan sonra `accessToken` değerini alın.
2) Cloud isteklerinizde Authorization header olarak Bearer token ekleyin:

```bash
curl -H "Authorization: Bearer <accessToken>" \
  "https://api.example.com/Cloud/List?Path=users/1/photos"
```

3) Access token süresi dolduğunda `POST /Authentication/RefreshToken` ile yenileyebilirsiniz (body: { refreshToken }).

---

---

## Genel

Base route: `/Cloud`

Açıklama: Bu modül kullanıcıya ait dosya depolama (objects) ve dizin (prefix) işlemlerini sağlar. Dosya listeleme, indirgeme, multipart upload, tek parça yükleme ve indirme (stream) gibi işlemleri destekler.

---

## Önemli modeller (kısa)

- CloudListRequestModel — Path, Delimiter, IsMetadataProcessing
- CloudKeyRequestModel — Key (dosya veya klasör anahtarı)
- CloudObjectModel — Dosya ile ilgili meta (Name, Extension, MimeType, Path, Size, ETag)
- CloudCreateMultipartUploadRequestModel — Key, ContentType?, Metadata?, TotalSize
- CloudCreateMultipartUploadResponseModel — UploadId, Key
- CloudUploadPartRequestModel / CloudUploadPartResponseModel — Tek parça yükleme isteği / ETag yanıtı
- CloudCompleteMultipartUploadRequestModel — Key, UploadId, Parts[(PartNumber, ETag)]
- CloudCompleteMultipartUploadResponseModel — Location, Key, Bucket, ETag, Metadata

---

## Endpoint'ler ve kullanımı

Aşağıda controller'da yer alan endpointlerin özetleri, beklenen parametreler ve örnek istekler bulunmaktadır.

### GET /Cloud/List

- Açıklama: Verilen path için breadcrumbs/directories/objects döner.
- Query params: Path (string), Delimiter (boolean), IsMetadataProcessing (boolean)
- Başarılı yanıt: CloudListResponseModel

Örnek:

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://api.example.com/Cloud/List?Path=users/1/photos&Delimiter=true"
```

---

### GET /Cloud/List/Breadcrumb

- Açıklama: Path parçalarını (breadcrumb) döner.
- Query params: Path
- Başarılı yanıt: Array<CloudBreadCrumbModel>

---

### GET /Cloud/List/Directories

- Açıklama: Path altındaki dizinleri listeler (prefixes).
- Query params: Path
- Başarılı yanıt: Array<CloudDirectoryModel>

---

### GET /Cloud/List/Objects

- Açıklama: Path altındaki dosyaları listeler.
- Query params: Path
- Başarılı yanıt: Array<CloudObjectModel>

---

### GET /Cloud/User/StorageUsage

- Açıklama: Kullanıcının depolama kullanımını ve limitlerini döner.
- Başarılı yanıt: CloudUserStorageUsageResponseModel

---

### GET /Cloud/Find

- Açıklama: Verilen Key için objenin metadata bilgisini döner.
- Query params: Key

Örnek:

```bash
curl -G -H "Authorization: Bearer <TOKEN>" \
  --data-urlencode "Key=users/1/photos/image.png" \
  "https://api.example.com/Cloud/Find"
```

---

### GET /Cloud/PresignedUrl

- Açıklama: Belirli bir anahtar için presigned (süreli) URL döner (upload veya download için).
- Query params: Key

---

### PUT /Cloud/Move

- Açıklama: Bir anahtarı başka bir anahtara taşır (aynı kullanıcı kapsamı içinde).
- Body:

```json
{
  "SourceKey": "users/1/photos/old.png",
  "DestinationKey": "users/1/photos/new.png"
}
```

- Yanıt: boolean (başarılıysa true)

---

### DELETE /Cloud/Delete

- Açıklama: Bir veya birden fazla objeyi siler.
- Body:

```json
{
  "Key": ["users/1/photos/image1.png", "users/1/photos/image2.png"],
  "IsDirectory": false
}
```

- Yanıt: boolean

---

### POST /Cloud/CreateDirectory

- Açıklama: Belirtilen Key ile klasör/prefix oluşturur.
- Body: CloudKeyRequestModel
- Yanıt: boolean

---

## Upload (Multipart) Flow

Bu modülde büyük dosya yüklemeleri için multipart upload akışı desteklenmektedir.

1. POST /Cloud/Upload/CreateMultipartUpload

- Body: CloudCreateMultipartUploadRequestModel
- Yanıt: { UploadId, Key }

2a) (Tercih edilen yol: sunucudan part URL alıp doğrudan storage'a yükleme)

- POST /Cloud/Upload/GetMultipartPartUrl — Body: { Key, UploadId, PartNumber }
- Yanıt: { Url, Expires }
- Client her part için dönen Url'e doğrudan upload eder (signed URL)

2b) (Alternatif: sunucuya parça yükleme)

- POST /Cloud/Upload/UploadPart
- Headers: multipart/form-data
- Body fields: Key, UploadId, PartNumber, File (binary)
- Yanıt: { ETag }

3. POST /Cloud/Upload/CompleteMultipartUpload

- Body: { Key, UploadId, Parts: [{PartNumber, ETag}, ...] }
- Yanıt: CloudCompleteMultipartUploadResponseModel

4. Eğer upload iptal edilirse:

- DELETE /Cloud/Upload/AbortMultipartUpload
- Body: { Key, UploadId }

Örnek akış (kısa):

```bash
# 1) Başlat
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"Key":"users/1/large.bin","TotalSize":10485760}' \
  https://api.example.com/Cloud/Upload/CreateMultipartUpload

# 2) Part URL al
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"Key":"users/1/large.bin","UploadId":"<ID>","PartNumber":1}' \
  https://api.example.com/Cloud/Upload/GetMultipartPartUrl

# 3) Part upload (doğrudan presigned URL ile)
# -> PUT <presigned-url> --data-binary @part1.bin (örnek cli işlem)

# 4) Tamamlama
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"Key":"users/1/large.bin","UploadId":"<ID>","Parts":[{"PartNumber":1,"ETag":"<etag>"}]}' \
  https://api.example.com/Cloud/Upload/CompleteMultipartUpload
```

---

### POST /Cloud/Upload/UploadPart (sunucu üzerinden parça yükleme)

- multipart/form-data
- Alanlar: Key, UploadId, PartNumber, File
- Yanıt: { ETag }

---

### DELETE /Cloud/Upload/AbortMultipartUpload

- Açıklama: Başlatılmış multipart upload oturumunu sonlandırır ve geçici verileri temizler.
- Body: { Key, UploadId }

---

### PUT /Cloud/Update

- Açıklama: Bir objenin basename (sadece ad) ile yeniden adlandırma ya da metadata güncellemesi yapar.
- Body örnek:

```json
{
  "Key": "users/1/photos/file.png",
  "Name": "newname.png",
  "Metadata": { "copyright": "me" }
}
```

- Yanıt: CloudObjectModel (güncellenmiş obje meta)

---

### GET /Cloud/Download

- Açıklama: Dosyayı stream şeklinde indirir (attachment header eklenir). Sunucu taraflı yükleme hız sınırına tabidir.
- Query params: Key
- Başarılı yanıt: Binary stream (application/octet-stream veya gerçek mime type)

Örnek:

```bash
curl -G -H "Authorization: Bearer <TOKEN>" \
  --data-urlencode "Key=users/1/photos/image.png" \
  "https://api.example.com/Cloud/Download" -o image.png
```

---

## Swagger (UI) notları

- Controller üzerinde `@ApiTags('Cloud')` ile gruplanmıştır.
- Tüm endpointlerde `@ApiOperation` ve `@ApiResponse` açıklamaları eklenmiştir. Bu sayede Swagger UI'da hem kısa açıklamalar hem de örnek response tipleri gözükecektir.

---

## Hatalar ve durum kodları

- 400 — Geçersiz istek parametreleri veya limit ihlalleri (ör. TotalSize / MaxUploadSizeBytes)
- 401/403 — Yetkilendirme / yetki problemi
- 404 — İstenen dosya bulunamadı
- 500 — Sunucu hatası

---

Herhangi bir örnek veya endpoint hakkında daha fazla detay isterseniz (örneğin daha fazla cURL örneği, SDK snippetleri veya test senaryoları) yazabilirim.
