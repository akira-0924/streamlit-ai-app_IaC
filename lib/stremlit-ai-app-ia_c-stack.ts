import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  IpAddresses,
  SubnetType,
  Vpc,
  Instance,
  SubnetSelection,
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  SecurityGroup,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  UserData,
} from "aws-cdk-lib/aws-ec2";
import { Role, ServicePrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";
import * as dotenv from "dotenv";

export class StreamlitAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    dotenv.config();

    const vpc = new Vpc(this, "Vpc", {
      vpcName: `practice-vpc`,
      ipAddresses: IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 1,
      natGateways: 0,
      createInternetGateway: true,
      subnetConfiguration: [
        {
          subnetType: SubnetType.PUBLIC,
          name: "Public",
          cidrMask: 24,
        },
      ],
    });
    // // // HTTPアクセス許可
    const publicSecurityGroup = new SecurityGroup(this, "webSecurityGroup", {
      vpc: vpc,
      securityGroupName: "web-user1",
    });
    publicSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(80),
      "Allow HTTP traffic"
    );
    publicSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(22),
      "Allow SSH traffic"
    );
    publicSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      "Allow HTTPS traffic"
    );
    const startPort = 8501;
    const endPort = 8510;

    // ポート範囲内のポートに対してイングレスルールを設定
    for (let port = startPort; port <= endPort; port++) {
      publicSecurityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(port),
        `Allow traffic on port ${port}`
      );
    }

    // //ハンズオンで設定するWebサーバーのユーザーデータ
    const userData = UserData.forLinux();
    userData.addCommands(
      "yum -y update",
      "yum -y install httpd",
      "yum -y install docker",
      "sudo chmod 666 /var/run/docker.sock",
      "sudo usermod -aG docker ec2-user",
      "sudo service docker start",
      "sudo systemctl start docker",
      "sudo systemctl enable docker",
      "sudo docker pull akira0924/stremlit-app:latest",
      "sudo docker run -it -p 443:8501 akira0924/stremlit-app:latest"
    );

    // //AmazonSSMFullAccessを付与したロールを作成(ハンズオン)
    const ec2Role = new Role(this, "ec2Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    });
    ec2Role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );
    ec2Role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );

    const createInstance = (
      id: string,
      name: string,
      instanceClass: InstanceClass,
      size: InstanceSize,
      publicIp: boolean,
      subnet: SubnetSelection,
      securityGroup: SecurityGroup,
      userData?: UserData
    ): Instance => {
      return new Instance(this, id, {
        instanceName: name,
        vpc,
        vpcSubnets: subnet,
        instanceType: InstanceType.of(instanceClass, size),
        machineImage: new AmazonLinuxImage({
          generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
        securityGroup: securityGroup,
        role: ec2Role,
        associatePublicIpAddress: publicIp,
        userData: userData,
      });
    };

    createInstance(
      "Instance1",
      "webserver-instance1",
      InstanceClass.T2,
      InstanceSize.MICRO,
      true,
      vpc.selectSubnets({
        subnetType: SubnetType.PUBLIC,
      }),
      publicSecurityGroup,
      userData
    );
  }
}
