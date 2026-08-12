import crypto from "node:crypto";

/**
 * مصادِق WebAuthn افتراضي للاختبارات.
 *
 * يولّد زوج مفاتيح **ES256 حقيقيًا** ويوقّع به فعلًا، فيمر مسار التحقق الكامل في
 * `@simplewebauthn/server` (تجزئة النطاق، أعلام المصادِق، العدّاد، التوقيع) بدل
 * محاكاة سطحية تختبر شيفرتنا وتتجاوز الجزء الذي يهم.
 *
 * لا علاقة له بالبصمة: المصادِق الحقيقي يتحقق من صاحبه محليًا ثم يوقّع، وهذا
 * يقفز فوق التحقق المحلي ويوقّع مباشرةً — وهو بالضبط ما يراه الخادم.
 */

type Credential = { id: string; privateKey: crypto.KeyObject; publicKeyCose: Buffer };

function sha256(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest();
}

/** يبني مفتاح COSE_Key لمنحنى P-256 (alg -7) كما يتوقعه المعيار. */
function toCoseKey(publicKey: crypto.KeyObject) {
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");

  // خريطة CBOR بخمسة مفاتيح: kty(1)=2، alg(3)=-7، crv(-1)=1، x(-2)، y(-3).
  return Buffer.concat([
    Buffer.from([0xa5]),
    Buffer.from([0x01, 0x02]),
    Buffer.from([0x03, 0x26]),
    Buffer.from([0x20, 0x01]),
    Buffer.from([0x21, 0x58, 0x20]), x,
    Buffer.from([0x22, 0x58, 0x20]), y,
  ]);
}

export class VirtualAuthenticator {
  private counter = 0;
  credential: Credential | null = null;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
    credential: Credential | null = null,
  ) {
    this.credential = credential;
  }

  mintCredential(): Credential {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.credential = {
      id: crypto.randomBytes(32).toString("base64url"),
      privateKey,
      publicKeyCose: toCoseKey(publicKey),
    };
    return this.credential;
  }

  private clientData(type: "webauthn.create" | "webauthn.get", challenge: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }), "utf8");
  }

  /**
   * بيانات المصادِق: تجزئة النطاق + الأعلام + العدّاد (+ بيانات الاعتماد عند التسجيل).
   *
   * `userVerified` يضبط علم UV (0x04) — وهو ما يعلن به المصادِق أنه تحقق من صاحبه
   * (بصمة/وجه/رمز قفل). إطفاؤه يحاكي مصادِقًا اكتفى بالحيازة، وهو ما يجب أن
   * يرفضه الخادم بعد التشديد.
   */
  private authData(options: { attested: boolean; userVerified: boolean }) {
    this.counter += 1;
    // UP(0x01) دائمًا | UV(0x04) عند التحقق | AT(0x40) عند التسجيل
    const flags = Buffer.from([0x01 | (options.userVerified ? 0x04 : 0x00) | (options.attested ? 0x40 : 0x00)]);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const base = Buffer.concat([sha256(this.rpId), flags, counter]);
    if (!options.attested) return base;

    const credential = this.credential!;
    const credentialId = Buffer.from(credential.id, "base64url");
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(credentialId.length);
    return Buffer.concat([base, Buffer.alloc(16), idLength, credentialId, credential.publicKeyCose]);
  }

  async register(options: { challenge: string }, config: { reuseCredential?: boolean; userVerified?: boolean } = {}) {
    if (!config.reuseCredential || !this.credential) this.mintCredential();
    const clientDataJSON = this.clientData("webauthn.create", options.challenge);
    const authenticatorData = this.authData({ attested: true, userVerified: config.userVerified ?? true });

    // attestationObject = {fmt:"none", attStmt:{}, authData:<bytes>}
    const authDataLength = Buffer.alloc(4);
    authDataLength.writeUInt32BE(authenticatorData.length);
    const attestationObject = Buffer.concat([
      Buffer.from([0xa3]),
      Buffer.from([0x63]), Buffer.from("fmt", "utf8"), Buffer.from([0x64]), Buffer.from("none", "utf8"),
      Buffer.from([0x67]), Buffer.from("attStmt", "utf8"), Buffer.from([0xa0]),
      Buffer.from([0x68]), Buffer.from("authData", "utf8"), Buffer.from([0x5a]), authDataLength, authenticatorData,
    ]);

    return {
      id: this.credential!.id,
      rawId: this.credential!.id,
      type: "public-key" as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientDataJSON.toString("base64url"),
        attestationObject: attestationObject.toString("base64url"),
        transports: ["internal" as const],
      },
    };
  }

  async authenticate(options: { challenge: string }, config: { userVerified?: boolean } = {}) {
    const credential = this.credential ?? this.mintCredential();
    const clientDataJSON = this.clientData("webauthn.get", options.challenge);
    const authenticatorData = this.authData({ attested: false, userVerified: config.userVerified ?? true });

    const signature = crypto.sign(
      "sha256",
      Buffer.concat([authenticatorData, sha256(clientDataJSON)]),
      { key: credential.privateKey, dsaEncoding: "der" },
    );

    return {
      id: credential.id,
      rawId: credential.id,
      type: "public-key" as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientDataJSON.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        signature: signature.toString("base64url"),
        userHandle: undefined,
      },
    };
  }
}
