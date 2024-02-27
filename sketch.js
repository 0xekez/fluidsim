const percision=60
const viscosity=40

class PingPong {
  constructor(init) {
    this.ping = createFramebuffer()
    this.pong = createFramebuffer()
    if (!!init) {
      this.ping.loadPixels()
      for (let x=0;x<width;x+=1)
        for (let y=0;y<height;y+=1) {
          const index = (x+y*width)*4
          const v = init(x,y)
          for (let i=0;i<4;i+=1)
            this.ping.pixels[index+i] = v[i]
        }
      this.ping.updatePixels()
    }
  }
  draw(f) {
    this.pong.draw(() => {
      f(this.ping)
    })
    const tmp = this.pong
    this.pong = this.ping
    this.ping = tmp
  }
  get texture() {
    return this.ping
  }
}

const makeShader = (fs, uniforms) => {
  const s = createShader(vs, fs)
  const setUniform = (k,v) => s.setUniform(k,v)
  return (...args) => {
    shader(s)
    uniforms(setUniform, ...args)
    rect(-width/2, -height/2, width, height)
  }
}

let velocity,pressure,div,paint
let advec,jacobi,divergence,subtractGradient,perturb,display
let movers = []
function setup() {
  createCanvas(512, 512, WEBGL)
  pixelDensity(1)
  noStroke()
  textureMode(NORMAL)
  textureWrap(REPEAT)

  paint = new PingPong((x,y)=>[0,0,0,1])
  velocity = new PingPong((x,y)=>[0,0,0,1])
  pressure = new PingPong()
  div = createFramebuffer()

  advec = makeShader(
    advec_fs,
    (setUniform, velocity, x, dimensions) => {
      setUniform("velocity",velocity)
      setUniform("x",x)
      setUniform("dimensions",dimensions)
    }
  )
  jacobi = makeShader(
    jacobi_fs,
    (setUniform, alpha, beta, ax, b) => {
      setUniform("alpha", alpha)
      setUniform("beta", beta)
      setUniform("ax", ax)
      setUniform("b",b)
      setUniform("dimensions",[width,height])
    }
  )
  divergence = makeShader(
    divergence_fs,
    (setUniform, x, dimensions) => {
      setUniform("x", x)
      setUniform("dimensions", dimensions)
    }
  )
  subtractGradient = makeShader(
    subtractGradient_fs,
    (setUniform, x, gradient) => {
      setUniform("x", x)
      setUniform("gradient", gradient)
    }
  )
  perturb = makeShader(
    perturb_fs,
    (setUniform, x, p, r, m) => {
      setUniform("x", x)
      setUniform("p", p)
      setUniform("r", r)
      setUniform("m", m)
    }
  )
  display = makeShader(
    display_fs,
    (setUniform, x, p, r) => {
      setUniform("x", x)
    }
  )

  let n = 7
  for (let i=0;i<n; i+=1) {
    const m = new Mover(width/2,height/2)
    m.m=i-n/2
    movers.push(m)
  }
}

function draw() {
  for (let m of movers) {
    m.tick()
    velocity.draw((velocity) => {
      perturb(velocity, [m.position.x/width, m.position.y/height], 0.05,m.m)
    })
    paint.draw((paint) => {
      perturb(paint, [m.position.x/width, m.position.y/height], 0.042,m.m)
    })
  }
  velocity.draw((velocity) => {
    advec(
      velocity,
      velocity,
      [width,height]
    )
  })
  for(let i=0;i<percision;i+=1)
    velocity.draw((velocity) => {
      jacobi(
        1/viscosity,
        4 + 1/viscosity,
        velocity,
        velocity
      )
    })
  div.draw(() => {
    divergence(velocity.texture,[width,height])
  })
  for(let i=0;i<percision;i+=1)
    pressure.draw((pressure) => {
      jacobi(
        -1,
        4,
        pressure,
        div
      )
    })
  velocity.draw((velocity) => {
    subtractGradient(
      velocity,
      pressure.texture
    )
  })

  paint.draw((paint) => {
    advec(
      velocity.texture,
      paint,
      [width,height]
    )
  })

  background(0)
  display(paint.texture)
}

const vs=`#version 300 es
precision highp float;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

in vec3 aPosition;
in vec2 aTexCoord;
out vec2 pos;

void main() {
  pos = aTexCoord;
  vec4 positionVec4 = vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
 }`

const advec_fs = `#version 300 es
precision highp float;
in vec2 pos;
uniform sampler2D velocity;
uniform sampler2D x;
uniform vec2 dimensions;

out vec4 y;

vec4 rv(sampler2D x, vec2 pos) {
  vec4 v = texture(x,pos);
  v.x=2.0*(v.x-0.5);
  v.y=2.0*(v.y-0.5);
  return v;
}

vec4 cerp(vec4 a,vec4 b,vec4 c,vec4 d,float x) {
  float xsq=x*x;
  float xcu=xsq*x;
  vec4 minV=min(a,min(b,min(c,d)));
  vec4 maxV=max(a,max(b,max(c,d)));
  vec4 t =
    a*(0.0 - 0.5*x + 1.0*xsq - 0.5*xcu) +
    b*(1.0 + 0.0*x - 2.5*xsq + 1.5*xcu) +
    c*(0.0 + 0.5*x + 2.0*xsq - 1.5*xcu) +
    d*(0.0 + 0.0*x - 0.5*xsq + 0.5*xcu);
  return min(max(t, minV), maxV);
}

vec4 bicubicSample(sampler2D tex, vec2 pos) {
  vec2 xPx = vec2(1.0,0.0)/dimensions;
  vec2 yPx = vec2(0.0,1.0)/dimensions;
  vec2 f = fract(pos*dimensions);

  vec2 topLeft = floor(pos*dimensions)/dimensions;
  vec2 toptopLeft = topLeft-xPx-yPx;

  vec4 q0 = cerp(
    texture(tex,toptopLeft),
    texture(tex,toptopLeft+xPx),
    texture(tex,toptopLeft+xPx*2.0),
    texture(tex,toptopLeft+xPx*3.0),
    f.x
  );
  vec4 q1 = cerp(
    texture(tex,toptopLeft+yPx),
    texture(tex,toptopLeft+yPx+xPx),
    texture(tex,toptopLeft+yPx+xPx*2.0),
    texture(tex,toptopLeft+yPx+xPx*3.0),
    f.x
  );
  vec4 q2 = cerp(
    texture(tex,toptopLeft+2.0*yPx),
    texture(tex,toptopLeft+2.0*yPx+xPx),
    texture(tex,toptopLeft+2.0*yPx+xPx*2.0),
    texture(tex,toptopLeft+2.0*yPx+xPx*3.0),
    f.x
  );
  vec4 q3 = cerp(
    texture(tex,toptopLeft+3.0*yPx),
    texture(tex,toptopLeft+3.0*yPx+xPx),
    texture(tex,toptopLeft+3.0*yPx+xPx*2.0),
    texture(tex,toptopLeft+3.0*yPx+xPx*3.0),
    f.x
  );

  return cerp(q0,q1,q2,q3,f.y);
}

void main() {
  vec2 firstV = rv(velocity,pos).xy;
  vec2 midP = pos - firstV/2.0;
  vec2 midV = rv(velocity,midP).xy;
  vec2 lastP = midP - 0.75*midV;
  vec2 lastV = rv(velocity,lastP).xy;

  vec2 dp = (2.0*firstV+3.0*midV+4.0*lastV)/dimensions/3.0;
  y = bicubicSample(x,pos-dp);
}
`

const divergence_fs = `#version 300 es
precision highp float;
in vec2 pos;
uniform sampler2D x;
uniform vec2 dimensions;

out float y;

void main() {
  vec2 stepX = vec2(1.0,0)/dimensions;
  vec2 stepY = vec2(0.0,1.0)/dimensions;
  float e = texture(x,pos+stepX).x;
  float w = texture(x,pos-stepX).x;
  float n = texture(x,pos+stepY).y;
  float s = texture(x,pos-stepY).y;
  y = (n-s+e-w)/2.0;
}
`

const jacobi_fs = `#version 300 es
precision highp float;
in vec2 pos;

uniform float alpha;
uniform float beta;
uniform vec2 dimensions;
uniform sampler2D ax;
uniform sampler2D b;

out vec4 y;

void main() {
  vec2 pxSize=vec2(1.0,1.0)/dimensions;
  vec4 n = texture(ax, pos + vec2(0, pxSize.y));
  vec4 s = texture(ax, pos - vec2(0, pxSize.y));
  vec4 e = texture(ax, pos + vec2(pxSize.x, 0));
  vec4 w = texture(ax, pos - vec2(pxSize.x, 0));
  vec4 d = texture(b, pos);
  y = (n + s + e + w + alpha * d) / beta;
}
`

const subtractGradient_fs = `#version 300 es
precision highp float;
in vec2 pos;
uniform sampler2D gradient;
uniform sampler2D x;
uniform vec2 dimensions;

out vec4 y;

void main() {
  vec2 stepX = vec2(1.0,0)/dimensions;
  vec2 stepY = vec2(0.0,1.0)/dimensions;
  float e = texture(gradient,pos+stepX).x;
  float w = texture(gradient,pos-stepX).x;
  float n = texture(gradient,pos+stepY).y;
  float s = texture(gradient,pos-stepY).y;
  y = texture(x,pos)-vec4(e-w,n-s,0.0,0.0)/2.0;
}
`

const perturb_fs = `#version 300 es
precision highp float;
in vec2 pos;

uniform sampler2D x;
uniform vec2 p;
uniform float r;
uniform float m;

out vec4 y;

void main() {
  float d = distance(p,pos);
  vec4 yp=texture(x,pos);
  // y=yp;
  if (d<r) {
    vec2 dp=normalize(pos-p)*(d/r)*m;
    yp.x+=dp.x/7.0;
    yp.y+=dp.y/7.0;
  }
  y=yp;
}
`

const display_fs = `#version 300 es
precision highp float;
in vec2 pos;

uniform sampler2D x;

out vec4 y;

void main() {
  vec4 yp=texture(x,pos);
  vec3 bg=vec3(237, 142, 145)/255.0;
  vec3 fg=vec3(251, 248, 203)/255.0;
  // vec3 fg=vec3(255, 255, 255)/255.0;
  // vec3 bg=vec3(0.0,0.0,0.0)/255.0;
  y=vec4(mix(bg,fg,(yp.x+yp.y)/2.0),1.0);
}
`
