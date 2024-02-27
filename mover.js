class Leader {
  constructor(x, y) {
    this.position = createVector(x, y)
    this.velocity = createVector(1, 1)
    this.home = createVector(x, y)
    this.pc = 0
  }
  
  tick() {
    const speed = 8
    if (this.pc % 45 == 0) {
      this.pc = 0
      const toHome = p5.Vector.sub(this.position, this.home)
      const theta = randomGaussian(toHome.heading(), Math.PI/3)
      this.velocity.setHeading(theta)
      this.velocity.normalize()
      this.velocity.mult(speed)
    }
    this.position.sub(this.velocity)
    this.pc += 1
    this.x = this.position.x
    this.y = this.position.y
  }
}

class Mover {
  constructor(x, y) {
    this.position = createVector(x, y)
    this.leader = new Leader(x, y)
  }

  tick() {
    this.leader.tick()
    const speed = 100
    const toLeader = p5.Vector.sub(this.leader.position, this.position)
    toLeader.div(speed)
    this.position.add(toLeader)
  }
}