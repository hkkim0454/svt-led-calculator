# src/vendor/three — Three.js 동봉본 (수정 금지)

## 왜 저장소에 넣어 두는가

이 프로젝트는 **빌드가 없다**(CLAUDE.md 규칙 4). `npm install`이나 번들러 없이
파일만 서버에 올리면 그대로 동작해야 한다. 그래서 Three.js를 CDN에서 불러오는 대신
**파일을 그대로 동봉**한다.

- 사내망에서 외부 CDN이 막혀도 화면이 뜬다.
- 버전이 저장소에 고정되므로 어제 만든 제안서 이미지와 오늘 것이 달라지지 않는다.
- `npm test`는 여전히 Node 내장만 쓴다(이 파일들은 브라우저 전용, 테스트가 불러오지 않는다).

## 들어 있는 것

| 파일 | 출처 | 크기 |
|---|---|---|
| `three.module.min.js` | `three@0.180.0` `build/three.module.min.js` | 331 KB |
| `three.core.min.js` | `three@0.180.0` `build/three.core.min.js` | 372 KB |
| `OrbitControls.js` | `three@0.180.0` `examples/jsm/controls/OrbitControls.js` | 38 KB |
| `LICENSE` | Three.js MIT 라이선스 | — |

`three.module.min.js`가 같은 폴더의 `three.core.min.js`를 부른다 — 둘은 항상 같이 둔다.

## 원본에서 고친 곳 (단 한 줄)

`OrbitControls.js` 12번째 줄:

```
-} from 'three';
+} from './three.module.min.js';
```

원본은 번들러가 `three`라는 이름을 해석해 준다고 가정한다. 빌드가 없는 여기서는
브라우저가 그 이름을 모르므로 실제 파일 경로로 바꿨다. **그 외에는 한 글자도 고치지 않았다.**

## 버전을 올리려면

```
npm pack three@<버전>
tar xzf three-<버전>.tgz
cp package/build/three.module.min.js package/build/three.core.min.js src/vendor/three/
cp package/LICENSE src/vendor/three/LICENSE
sed "s|} from 'three';|} from './three.module.min.js';|" \
  package/examples/jsm/controls/OrbitControls.js > src/vendor/three/OrbitControls.js
```

올린 뒤 3D 뷰를 열어 콘솔 오류가 없는지 확인하고, `docs/audit.md`에 기록한다.
